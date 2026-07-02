<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { setAppServicesContext } from '$lib/contexts/app-services';
	import { RuntimeErrorNotifier } from '$lib/errors/runtime-error';
	import { createIpcActions } from '$lib/services/ipc-actions';
	import { SyncState } from '$lib/stores/sync.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import Toaster from '$lib/components/ui/sonner/sonner.svelte';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children?: Snippet; data: LayoutData } = $props();
	const syncState = new SyncState();
	const runtimeErrors = new RuntimeErrorNotifier();
	const ipcActions = createIpcActions({ syncState, runtimeErrors });

	setAppServicesContext({ syncState, runtimeErrors, ipcActions });

	$effect(() => {
		syncState.configure(data.settings.importToAppleMusic, data.hasUnsyncedChanges);
	});

	onMount(() => {
		const onError = (event: ErrorEvent) => {
			runtimeErrors.notify(event.error ?? event.message, 'Unexpected runtime error');
		};
		const onUnhandledRejection = (event: PromiseRejectionEvent) => {
			runtimeErrors.notify(event.reason, 'Unhandled promise rejection');
		};

		window.addEventListener('error', onError);
		window.addEventListener('unhandledrejection', onUnhandledRejection);

		return () => {
			window.removeEventListener('error', onError);
			window.removeEventListener('unhandledrejection', onUnhandledRejection);
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher />
<Toaster />
{@render children?.()}
