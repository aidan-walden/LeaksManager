<script lang="ts" module>
	// sample data
	const data = {
		navMain: [
			{
				title: 'Library',
				url: '',
				items: [
					{
						title: 'Songs',
						url: '/songs'
					},
					{
						title: 'Albums',
						url: '/albums'
					},
					{
						title: 'Artists',
						url: '/artists'
					},
					{
						title: 'Producers',
						url: '/producers'
					}
				]
			},
			{
				title: 'Application',
				url: '',
				items: [
					{
						title: 'Settings',
						url: ''
					}
				]
			}
		]
	};
</script>

<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { ComponentProps } from 'svelte';
	import SyncChangesCard from './ui/sync-changes-card.svelte';

	let {
		currentPath = '/',
		onSettingsClick,
		ref = $bindable(null),
		...restProps
	}: ComponentProps<typeof Sidebar.Root> & {
		currentPath?: string;
		onSettingsClick?: () => void;
	} = $props();
</script>

<Sidebar.Root {...restProps} bind:ref>
	<Sidebar.Content>
		<!-- We create a Sidebar.Group for each parent. -->
		{#each data.navMain as group (group.title)}
			<Sidebar.Group>
				<Sidebar.GroupLabel>{group.title}</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each group.items as item (item.title)}
							{#if item.title === 'Settings'}
								<Sidebar.MenuButton onclick={onSettingsClick}>
									{item.title}
								</Sidebar.MenuButton>
							{:else}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton isActive={currentPath === item.url}>
										{#snippet child({ props })}
											<a href={item.url} {...props}>{item.title}</a>
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/if}
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/each}
	</Sidebar.Content>
	<SyncChangesCard />
	<Sidebar.Rail />
</Sidebar.Root>
