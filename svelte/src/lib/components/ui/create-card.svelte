<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { FileDropZone } from '@/components/ui/file-drop-zone';
	import { invalidateAll } from '$app/navigation';

	type UploadConfig = {
		tabLabel: string;
		placeholder?: string;
		onUpload: (files: File[]) => Promise<void>;
		accept?: string;
		maxFiles?: number;
		preview?: Blob | null;
	};

	let {
		open = $bindable(),
		onOpenChange,
		callback,
		title,
		formId,
		submitLabel = 'Create',
		metadataTabLabel = 'Metadata',
		upload,
		formFields,
		beforeSubmit,
		onSubmit
	}: {
		open: boolean;
		onOpenChange?: (open: boolean) => void;
		callback?: (recordId: number) => void;
		title: string;
		formId: string;
		submitLabel?: string;
		metadataTabLabel?: string;
		upload?: UploadConfig;
		formFields: Snippet<[loading: boolean]>;
		beforeSubmit?: () => boolean;
		onSubmit: (formData: FormData) => Promise<{ id?: number }>;
	} = $props();

	let formElement: HTMLFormElement;
	let loading = $state(false);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (beforeSubmit && !beforeSubmit()) {
			return;
		}

		loading = true;
		try {
			const formData = new FormData(formElement);
			const result = await onSubmit(formData);

			formElement.reset();
			await invalidateAll();

			if (callback && result?.id) {
				callback(result.id);
			}

			open = false;
		} catch (error) {
			console.error('Form submission error:', error);
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
			<Tabs.Trigger value="metadata">{metadataTabLabel}</Tabs.Trigger>
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
						maxFiles={upload.maxFiles ?? 1}
						accept={upload.accept ?? 'image/*'}
						onUpload={upload.onUpload}
						disabled={loading}
						class="size-full"
					>
						{#if upload.preview}
							<img
								src={URL.createObjectURL(upload.preview)}
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

<AlertDialog.Root bind:open {onOpenChange}>
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
