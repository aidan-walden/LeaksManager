<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { getAppServicesContext } from '$lib/contexts/app-services';
	import { runAsyncAction } from '$lib/errors/async-action';
	import { toast } from 'svelte-sonner';
	import { fly } from 'svelte/transition';

	const { syncState, wailsActions } = getAppServicesContext();

	async function handleSync() {
		syncState.startSync();
		const result = await runAsyncAction(() => wailsActions.syncSongsToAppleMusic(), (error) => {
			const message = error instanceof Error ? error.message : 'Unknown error';
			syncState.finishSync(false, {
				message,
				failedCount: 0,
				totalCount: 0,
				timestamp: Date.now()
			});
		});
		if (!result) {
			return;
		}

		syncState.updateProgress(result.totalSongs, result.totalSongs);

		if (result.failureCount === 0) {
			syncState.finishSync(true);

			const addedMsg = result.addedCount > 0 ? `, ${result.addedCount} added` : '';
			const updatedMsg = result.updatedCount > 0 ? `, ${result.updatedCount} updated` : '';
			toast.success(`Successfully synced ${result.successCount} songs${addedMsg}${updatedMsg}`);
			return;
		}

		syncState.finishSync(false, {
			message: `${result.failureCount} songs failed to sync`,
			failedCount: result.failureCount,
			totalCount: result.totalSongs,
			timestamp: result.completedAt
		});

		toast.error(`Sync completed with ${result.failureCount} errors`);
	}
</script>

{#if syncState.shouldShow}
	<div class="mb-4" transition:fly={{ y: 20, duration: 300 }}>
		<Card.Root>
			<Card.Header>
				<Card.Title>
					{syncState.hasError ? 'Sync Error' : 'Unsaved Changes'}
				</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if syncState.isSyncing}
					<p>Syncing changes to Apple Music...</p>
					<Progress value={syncState.progressPercent} class="mt-2" />
					<p class="mt-1 text-sm text-muted-foreground">
						{syncState.syncProgress?.current ?? 0} / {syncState.syncProgress?.total ?? 0}
					</p>
				{:else if syncState.hasError}
					<p class="text-destructive">{syncState.lastSyncError?.message}</p>
					<p class="mt-2 text-sm text-muted-foreground">
						{syncState.lastSyncError?.failedCount} of {syncState.lastSyncError?.totalCount} songs failed
					</p>
					<!-- TODO: future error card implementation will show detailed errors here -->
				{:else}
					<p>You have changes that have not been synced to your music provider.</p>
					<p>Would you like to sync them now?</p>
				{/if}
			</Card.Content>
			<Card.Footer class="flex-col gap-2">
				<Button type="submit" class="w-full" onclick={handleSync} disabled={syncState.isSyncing}>
					{syncState.isSyncing ? 'Syncing...' : syncState.hasError ? 'Retry Sync' : 'Sync'}
				</Button>
				<Button
					type="button"
					class="w-full"
					variant="outline"
					onclick={() => syncState.dismiss()}
					disabled={syncState.isSyncing}
				>
					Dismiss
				</Button>
			</Card.Footer>
		</Card.Root>
	</div>
{/if}
