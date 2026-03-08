<script lang="ts">
	import { page } from '$app/state';
	import InnerView from '$lib/components/inner-view.svelte';

	import type { TabViewData } from '$lib/view-models/tab-data';

	const tab = $derived(page.params.tab || 'songs');

	let { data }: { data: TabViewData } = $props();
</script>

<InnerView {tab} {data} />
