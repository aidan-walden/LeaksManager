<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { setAppServicesContext } from '$lib/contexts/app-services';
	import {
		createRuntimeErrorNotifier
	} from '$lib/errors/runtime-error';
	import {
		createWailsActions
	} from '$lib/services/wails-actions';
	import { createSyncState } from '$lib/stores/sync.svelte';
	import { wailsTransport } from '$lib/wails';
	import { ModeWatcher } from 'mode-watcher';
	import Toaster from '$lib/components/ui/sonner/sonner.svelte';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children?: Snippet; data: LayoutData } = $props();
	const syncState = createSyncState();
	const runtimeErrors = createRuntimeErrorNotifier();
	const wailsActions = createWailsActions({ syncState, runtimeErrors }, wailsTransport);

	setAppServicesContext({ syncState, runtimeErrors, wailsActions });

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
