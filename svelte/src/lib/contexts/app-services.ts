import { getContext, setContext } from 'svelte';
import type { RuntimeErrorNotifier } from '$lib/errors/runtime-error';
import type { IpcActions } from '$lib/services/ipc-actions';
import type { SyncState } from '$lib/stores/sync.svelte';

const APP_SERVICES_KEY = Symbol('app-services');

type AppServices = {
	syncState: SyncState;
	runtimeErrors: RuntimeErrorNotifier;
	ipcActions: IpcActions;
};

export function setAppServicesContext(services: AppServices) {
	setContext(APP_SERVICES_KEY, services);
	return services;
}

export function getAppServicesContext(): AppServices {
	const services = getContext<AppServices | undefined>(APP_SERVICES_KEY);
	if (!services) throw new Error('app services context is not available');
	return services;
}
