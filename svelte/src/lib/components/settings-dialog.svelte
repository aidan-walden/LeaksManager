<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import type { Settings } from '$lib/server/db/schema';

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
</script>

<Dialog.Root bind:open={editingSettings} {onOpenChange}>
	<Dialog.Content class="sm">
		<form
			method="POST"
			action="/settings?/updateSettings"
			use:enhance={() => {
				isSubmitting = true;
				return async ({ result, update }) => {
					isSubmitting = false;
					if (result.type === 'success') {
						// Update page data first to get fresh settings
						await update();
						// Then show success message and close dialog
						toast.success('Settings saved successfully');
						editingSettings = false;
					} else if (result.type === 'failure') {
						const errorMsg = (result.data as { error?: string })?.error || 'Failed to save settings';
						toast.error(errorMsg);
					}
				};
			}}
		>
			<Dialog.Header>
				<Dialog.Title>Settings</Dialog.Title>
			</Dialog.Header>
			<div class="grid gap-4 py-4">
				<div class="flex items-center gap-4">
					<Checkbox
						id="clear-track-num"
						name="clearTrackNumberOnUpload"
						checked={settings.clearTrackNumberOnUpload}
					/>
					<Label for="clear-track-num" class="text-left">
						Clear track number on newly uploaded songs
					</Label>
				</div>
				<div class="flex items-center gap-4">
					<Checkbox
						id="auto-make-singles"
						name="automaticallyMakeSingles"
						checked={settings.automaticallyMakeSingles}
					/>
					<Label for="auto-make-singles" class="text-left">
						Automatically make songs with no album into singles
					</Label>
				</div>
				{#if isServerMac}
					<div class="flex items-center gap-4">
						<Checkbox
							id="import-to-apple-music"
							name="importToAppleMusic"
							checked={settings.importToAppleMusic}
						/>
						<Label for="import-to-apple-music" class="text-left">
							Import songs to Apple Music via AppleScript
						</Label>
					</div>
				{/if}
			</div>
			<Dialog.Footer>
				<Button type="submit" disabled={isSubmitting}>
					{#if isSubmitting}
						<Loader2Icon class="animate-spin" />
					{/if}
					Save changes
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
