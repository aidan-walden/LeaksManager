import { getWailsActionsContext, setWailsActionsContext, type WailsActions } from '$lib/services/wails-actions';
import {
	getRuntimeErrorNotifierContext,
	setRuntimeErrorNotifierContext,
	type RuntimeErrorNotifierLike
} from '$lib/errors/runtime-error';
import { getSyncStateContext, setSyncStateContext, type SyncStateLike } from '$lib/stores/sync.svelte';

type AppServices = {
	syncState: SyncStateLike;
	runtimeErrors: RuntimeErrorNotifierLike;
	wailsActions: WailsActions;
};

export function setAppServicesContext(services: AppServices) {
	setSyncStateContext(services.syncState);
	setRuntimeErrorNotifierContext(services.runtimeErrors);
	setWailsActionsContext(services.wailsActions);
	return services;
}

export function getAppServicesContext(): AppServices {
	return {
		syncState: getSyncStateContext(),
		runtimeErrors: getRuntimeErrorNotifierContext(),
		wailsActions: getWailsActionsContext()
	};
}
