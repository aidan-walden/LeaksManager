<script lang="ts">
	import { page } from '$app/state';
	import InnerView from '$lib/components/inner-view.svelte';

	import type { PageData } from './$types';

	const tab = $derived(page.params.tab || 'songs');

	let { data }: { data: PageData } = $props();
</script>

<InnerView {tab} {data} />
