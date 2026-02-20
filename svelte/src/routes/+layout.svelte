<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner';
	import { onMount } from 'svelte';
	import { notifyRuntimeError } from '$lib/errors/runtime-error';

	let { children } = $props();

	onMount(() => {
		const onError = (event: ErrorEvent) => {
			notifyRuntimeError(event.error ?? event.message, 'Unexpected runtime error');
		};
		const onUnhandledRejection = (event: PromiseRejectionEvent) => {
			notifyRuntimeError(event.reason, 'Unhandled promise rejection');
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
