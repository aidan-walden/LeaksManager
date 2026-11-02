<script lang="ts">
	import { page } from '$app/state';
	import InnerView from '$lib/components/inner-view.svelte';
	import type { PageProps } from './$types';

	const tab = $derived(page.params.tab || 'songs');

	let { data }: PageProps = $props();
</script>

<InnerView {tab} {data} />
