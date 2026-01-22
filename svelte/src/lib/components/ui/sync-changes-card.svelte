<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { syncState } from '$lib/stores/sync.svelte';
	import { fly } from 'svelte/transition';
</script>

{#if syncState.shouldShow}
	<div class="mb-4" transition:fly={{ y: 20, duration: 300 }}>
		<Card.Root>
			<Card.Header>
				<Card.Title>Unsaved Changes</Card.Title>
			</Card.Header>
			<Card.Content>
				<p>You have changes that have not been synced to your music provider.</p>
				<p>Would you like to sync them now?</p>
			</Card.Content>
			<Card.Footer class="flex-col gap-2">
				<Button type="submit" class="w-full" onclick={() => {}}>Sync</Button>
				<Button
					type="button"
					class="w-full"
					variant="outline"
					onclick={() => syncState.dismiss()}
				>
					Dismiss
				</Button>
			</Card.Footer>
		</Card.Root>
	</div>
{/if}