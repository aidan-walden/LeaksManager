<script lang="ts">
	import { page } from '$app/state';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import InnerView from '$lib/components/inner-view.svelte';

	import type { PageData } from './$types';

	const tab = $derived(page.params.tab || 'songs');
	const currentPath = $derived('/' + tab);

	let { data }: { data: PageData } = $props();
</script>

<Sidebar.Provider>
	<AppSidebar {currentPath} />
	<Sidebar.Inset>
		<header class="flex h-16 shrink-0 items-center gap-2 border-b px-4">
			<Sidebar.Trigger class="-ml-1" />
			<Separator orientation="vertical" class="mr-2 h-4" />
		</header>
		<div class="flex flex-1 flex-col gap-4 p-4">
			<InnerView {tab} {data} />
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
