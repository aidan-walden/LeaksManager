import { getContext, setContext } from 'svelte';
import type { RuntimeErrorNotifierLike } from '$lib/errors/runtime-error';
import type { SyncStateLike } from '$lib/stores/sync.svelte';
import { wailsTransport } from '$lib/wails';
import type { Settings } from '$lib/wails';

const WAILS_ACTIONS_KEY = Symbol('wails-actions');

type AsyncMethod = (...args: any[]) => Promise<any>;

type ActionConfig<T extends AsyncMethod> = {
	context?: string;
	markChanged?: boolean;
	onSuccess?: (
		result: Awaited<ReturnType<T>>,
		dependencies: WailsActionDependencies
	) => void;
};

type ActionConfigMap<TTransport extends Record<string, AsyncMethod>> = {
	[K in keyof TTransport]?: ActionConfig<TTransport[K]>;
};

export type WailsActionDependencies = {
	syncState: SyncStateLike;
	runtimeErrors: RuntimeErrorNotifierLike;
};

const actionConfig = {
	createSong: { markChanged: true },
	updateSong: { markChanged: true },
	deleteSong: { markChanged: true },
	writeSongMetadata: { markChanged: true },
	createSongsWithMetadata: { markChanged: true },
	uploadSongs: { markChanged: true },
	updateSettings: {
		onSuccess: (settings: Settings, { syncState }) => {
			syncState.configure(settings.importToAppleMusic);
		}
	}
} satisfies ActionConfigMap<typeof wailsTransport>;

function formatActionContext(key: string) {
	return key.charAt(0).toUpperCase() + key.slice(1);
}

function buildActions<TTransport extends Record<string, AsyncMethod>>(
	transport: TTransport,
	config: ActionConfigMap<TTransport>,
	dependencies: WailsActionDependencies
) {
	const actions = {} as {
		[K in keyof TTransport]: (
			...args: Parameters<TTransport[K]>
		) => Promise<Awaited<ReturnType<TTransport[K]>>>;
	};

	for (const key of Object.keys(transport) as (keyof TTransport)[]) {
		const method = transport[key];
		actions[key] = (async (...args: Parameters<TTransport[typeof key]>) => {
			try {
				const result = await method(...args);
				const options = config[key];
				if (options?.markChanged) {
					dependencies.syncState.markChanged();
				}
				options?.onSuccess?.(result, dependencies);
				return result;
			} catch (error) {
				dependencies.runtimeErrors.notify(
					error,
					config[key]?.context ?? formatActionContext(String(key))
				);
				throw error;
			}
		}) as (
			...args: Parameters<TTransport[typeof key]>
		) => Promise<Awaited<ReturnType<TTransport[typeof key]>>>;
	}

	return actions;
}

export type WailsActions = ReturnType<typeof createWailsActions>;

export function createWailsActions(
	dependencies: WailsActionDependencies,
	transport = wailsTransport
) {
	return buildActions(transport, actionConfig, dependencies);
}

export function setWailsActionsContext(wailsActions: WailsActions) {
	setContext(WAILS_ACTIONS_KEY, wailsActions);
	return wailsActions;
}

export function getWailsActionsContext() {
	const wailsActions = getContext<WailsActions | undefined>(WAILS_ACTIONS_KEY);
	if (!wailsActions) {
		throw new Error('wails actions context is not available');
	}

	return wailsActions;
}
