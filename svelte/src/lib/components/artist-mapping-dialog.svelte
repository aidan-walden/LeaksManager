<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import type { Artist } from '$lib/wails';

	let {
		open = $bindable(),
		unmappedArtists,
		existingArtists,
		onResolve,
		onCancel
	}: {
		open: boolean;
		unmappedArtists: string[];
		existingArtists: Artist[];
		onResolve: (mapping: Record<string, number | 'CREATE_NEW'>) => void;
		onCancel: () => void;
	} = $props();

	// Initialize mapping with default 'CREATE_NEW' for each unmapped artist
	let mapping = $state<Record<string, number | 'CREATE_NEW'>>(
		Object.fromEntries(unmappedArtists.map((artist) => [artist, 'CREATE_NEW']))
	);

	function handleSubmit() {
		onResolve(mapping);
		open = false;
	}

	function handleCancel() {
		onCancel();
		open = false;
	}

	// Reactive: Update mapping when unmappedArtists changes
	$effect(() => {
		mapping = Object.fromEntries(unmappedArtists.map((artist) => [artist, 'CREATE_NEW']));
	});
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content class="max-w-2xl max-h-[80vh] overflow-y-auto">
			<AlertDialog.Header>
				<AlertDialog.Title>Map Artists</AlertDialog.Title>
				<AlertDialog.Description>
					The following artists were found in your files but don't exist in the database. For each
					artist, you can either create a new artist or map to an existing one.
				</AlertDialog.Description>
			</AlertDialog.Header>

			<div class="my-6 space-y-4">
				{#each unmappedArtists as artistName}
					<div class="grid gap-2">
						<Label for={`artist-${artistName}`} class="font-medium">
							{artistName}
						</Label>
						<select
							id={`artist-${artistName}`}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
							bind:value={mapping[artistName]}
						>
							<option value="CREATE_NEW">Create new artist: {artistName}</option>
							<optgroup label="Map to existing artist">
								{#each existingArtists as artist}
									<option value={artist.id}>{artist.name}</option>
								{/each}
							</optgroup>
						</select>
					</div>
				{/each}
			</div>

			<AlertDialog.Footer class="flex gap-2">
				<Button variant="outline" onclick={handleCancel}>Cancel</Button>
				<Button onclick={handleSubmit}>OK</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
