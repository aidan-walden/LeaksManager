<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';

	let {
		open = $bindable(),
		filesWithArtwork,
		onChoice
	}: {
		open: boolean;
		filesWithArtwork: number;
		onChoice: (useEmbedded: boolean) => void;
	} = $props();

	function handleUseEmbedded() {
		onChoice(true);
		open = false;
	}

	function handleInheritFromAlbum() {
		onChoice(false);
		open = false;
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>Embedded Artwork Found</AlertDialog.Title>
				<AlertDialog.Description>
					{filesWithArtwork}
					{filesWithArtwork === 1 ? 'file has' : 'files have'} embedded artwork. Would you like to use
					the embedded artwork for these songs, or inherit artwork from the album?
				</AlertDialog.Description>
			</AlertDialog.Header>

			<AlertDialog.Footer class="flex-col sm:flex-row gap-2">
				<Button variant="outline" onclick={handleInheritFromAlbum} class="w-full sm:w-auto">
					Inherit from Album
				</Button>
				<Button onclick={handleUseEmbedded} class="w-full sm:w-auto">Use Embedded Artwork</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
