<script lang="ts">
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { page } from '$app/state';
	import SettingsDialog from '@/components/settings-dialog.svelte';

	const tab = $derived(page.params.tab || 'songs');
	const currentPath = $derived('/' + tab);

	let settingsOpen = $state(false);

	function onClickSettings() {
		settingsOpen = true;
	}

	function onSettingsOpenChange(open: boolean) {
		settingsOpen = open;
	}

	const { children, data } = $props();
</script>

<Sidebar.Provider>
	<AppSidebar {currentPath} onSettingsClick={onClickSettings} />
	<Sidebar.Inset>
		<header class="flex h-16 shrink-0 items-center gap-2 border-b px-4">
			<Sidebar.Trigger class="-ml-1" />
			<Separator orientation="vertical" class="mr-2 h-4" />
		</header>
		<div class="flex flex-1 flex-col gap-4 p-4">
			{@render children?.()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>

<SettingsDialog bind:editingSettings={settingsOpen} onOpenChange={onSettingsOpenChange} settings={data.settings} isServerMac={data.isServerMac} />
