<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { FileDropZone } from '$lib/components/ui/file-drop-zone';
	import { invalidateAll } from '$app/navigation';

	type UploadConfig = {
		tabLabel: string;
		placeholder?: string;
		onUpload: (files: File[]) => void | Promise<void>;
		accept?: string;
		limit?: {
			maxFiles: number;
			fileCount: number;
		};
		preview?: Blob | null;
	};

	let {
		open = $bindable(),
		title,
		formId,
		submitLabel = 'Create',
		upload,
		formFields,
		beforeSubmit,
		onSubmit
	}: {
		open: boolean;
		title: string;
		formId: string;
		submitLabel?: string;
		upload?: UploadConfig;
		formFields: Snippet<[loading: boolean]>;
		beforeSubmit?: () => boolean;
		onSubmit: (formData: FormData) => Promise<void>;
	} = $props();

	let formElement: HTMLFormElement;
	let loading = $state(false);
	let previewUrl = $state<string | null>(null);

	$effect(() => {
		const preview = upload?.preview;
		if (!preview) {
			previewUrl = null;
			return;
		}
		const url = URL.createObjectURL(preview);
		previewUrl = url;
		return () => URL.revokeObjectURL(url);
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (beforeSubmit && !beforeSubmit()) {
			return;
		}

		loading = true;
		try {
			try {
				await onSubmit(new FormData(formElement));
			} catch {
				// The failed action already showed a toast. Part of the submit can have
				// succeeded, so refresh the data and keep the dialog open.
				await invalidateAll();
				return;
			}

			await invalidateAll();
			open = false;
		} finally {
			loading = false;
		}
	}
</script>

{#snippet formContent()}
	<form id={formId} onsubmit={handleSubmit} bind:this={formElement}>
		{@render formFields(loading)}
	</form>
{/snippet}

{#snippet tabs()}
	<Tabs.Root value="metadata" class="flex h-full w-full flex-col">
		<Tabs.List>
			<Tabs.Trigger value="metadata">Metadata</Tabs.Trigger>
			{#if upload}
				<Tabs.Trigger value="upload">{upload.tabLabel}</Tabs.Trigger>
			{/if}
		</Tabs.List>
		<Tabs.Content value="metadata" class="flex flex-1 justify-start">
			<div class="w-full max-w-[400px]">
				{@render formContent()}
			</div>
		</Tabs.Content>
		{#if upload}
			<Tabs.Content value="upload" class="flex flex-1 items-center justify-center p-4">
				<div class="mx-auto aspect-square w-full max-w-[20rem]">
					<FileDropZone
						limit={upload.limit}
						accept={upload.accept ?? 'image/*'}
						onUpload={upload.onUpload}
						disabled={loading}
						class="size-full"
					>
						{#if previewUrl}
							<img
								src={previewUrl}
								alt="Uploaded file preview"
								class="size-full rounded-md object-cover"
							/>
						{:else}
							<div class="flex size-full items-center justify-center text-center">
								{upload.placeholder ?? 'Upload File'}
							</div>
						{/if}
					</FileDropZone>
				</div>
			</Tabs.Content>
		{/if}
	</Tabs.Root>
{/snippet}

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
		</AlertDialog.Header>
		<div style="min-height: 450px; max-height: 450px;">
			{#if upload}
				{@render tabs()}
			{:else}
				<div class="flex h-full w-full items-start justify-start pt-4 pl-0.5">
					<div class="w-full max-w-[400px]">
						{@render formContent()}
					</div>
				</div>
			{/if}
		</div>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={loading}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action type="submit" form={formId} disabled={loading}
				>{submitLabel}</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
