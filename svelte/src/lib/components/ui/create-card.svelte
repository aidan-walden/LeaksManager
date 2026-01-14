<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { FileDropZone } from '@/components/ui/file-drop-zone';
	import { invalidateAll } from '$app/navigation';

	let {
		open = $bindable(),
		onOpenChange,
		callback,
		title,
		formId,
		submitLabel = 'Create',
		metadataTabLabel = 'Metadata',
		uploadTabLabel,
		uploadPlaceholder = 'Upload File',
		onFileUpload,
		uploadAccept = 'image/*',
		uploadMaxFiles = 1,
		uploadFieldImage,
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
		uploadTabLabel?: string;
		uploadPlaceholder?: string;
		onFileUpload?: (files: File[]) => Promise<void>;
		uploadAccept?: string;
		uploadMaxFiles?: number;
		uploadFieldImage?: Blob | null;
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
			{#if uploadTabLabel}
				<Tabs.Trigger value="upload">{uploadTabLabel}</Tabs.Trigger>
			{/if}
		</Tabs.List>
		<Tabs.Content value="metadata" class="flex flex-1 justify-start">
			<div class="w-full max-w-[400px]">
				{@render formContent()}
			</div>
		</Tabs.Content>
		{#if uploadTabLabel}
			<Tabs.Content value="upload" class="flex flex-1 items-center justify-center p-4">
				<div class="mx-auto aspect-square w-full max-w-[20rem]">
					<FileDropZone
						maxFiles={uploadMaxFiles}
						accept={uploadAccept}
						onUpload={onFileUpload ?? (() => Promise.resolve())}
						disabled={loading}
						class="size-full"
					>
						{#if uploadFieldImage}
							<img
								src={URL.createObjectURL(uploadFieldImage)}
								alt="Uploaded file preview"
								class="size-full rounded-md object-cover"
							/>
						{:else}
							<div class="flex size-full items-center justify-center text-center">
								{uploadPlaceholder}
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
			{#if uploadTabLabel}
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
