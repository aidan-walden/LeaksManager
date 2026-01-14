<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { toast } from 'svelte-sonner';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { UpdateSettings, type Settings } from '$lib/wails';
	import { invalidateAll } from '$app/navigation';

	let {
		editingSettings = $bindable(),
		onOpenChange,
		settings,
		isServerMac
	}: {
		editingSettings?: boolean;
		onOpenChange?: (value: boolean) => void;
		settings: Settings;
		isServerMac: boolean;
	} = $props();

	let isSubmitting = $state(false);
	let clearTrackNumber = $state(settings.clearTrackNumberOnUpload);
	let autoMakeSingles = $state(settings.automaticallyMakeSingles);
	let importToAppleMusic = $state(settings.importToAppleMusic);

	// sync state when settings prop changes
	$effect(() => {
		clearTrackNumber = settings.clearTrackNumberOnUpload;
		autoMakeSingles = settings.automaticallyMakeSingles;
		importToAppleMusic = settings.importToAppleMusic;
	});

	async function handleSave() {
		isSubmitting = true;
		try {
			await UpdateSettings({
				clearTrackNumberOnUpload: clearTrackNumber,
				automaticallyMakeSingles: autoMakeSingles,
				importToAppleMusic: importToAppleMusic
			});
			await invalidateAll();
			toast.success('Settings saved successfully');
			editingSettings = false;
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to save settings';
			toast.error(errorMsg);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<Dialog.Root bind:open={editingSettings} {onOpenChange}>
	<Dialog.Content class="sm">
		<Dialog.Header>
			<Dialog.Title>Settings</Dialog.Title>
		</Dialog.Header>
		<div class="grid gap-4 py-4">
			<div class="flex items-center gap-4">
				<Checkbox
					id="clear-track-num"
					checked={clearTrackNumber}
					onCheckedChange={(checked) => (clearTrackNumber = checked === true)}
				/>
				<Label for="clear-track-num" class="text-left">
					Clear track number on newly uploaded songs
				</Label>
			</div>
			<div class="flex items-center gap-4">
				<Checkbox
					id="auto-make-singles"
					checked={autoMakeSingles}
					onCheckedChange={(checked) => (autoMakeSingles = checked === true)}
				/>
				<Label for="auto-make-singles" class="text-left">
					Automatically make songs with no album into singles
				</Label>
			</div>
			{#if isServerMac}
				<div class="flex items-center gap-4">
					<Checkbox
						id="import-to-apple-music"
						checked={importToAppleMusic}
						onCheckedChange={(checked) => (importToAppleMusic = checked === true)}
					/>
					<Label for="import-to-apple-music" class="text-left">
						Import songs to Apple Music via AppleScript
					</Label>
				</div>
			{/if}
		</div>
		<Dialog.Footer>
			<Button onclick={handleSave} disabled={isSubmitting}>
				{#if isSubmitting}
					<Loader2Icon class="animate-spin" />
				{/if}
				Save changes
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
