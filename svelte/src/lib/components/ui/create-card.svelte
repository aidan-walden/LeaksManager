<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { FileDropZone } from '@/components/ui/file-drop-zone';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	let {
		open = $bindable(),
		onOpenChange,
		callback,
		title,
		formId,
		formAction,
		submitLabel = 'Create',
		metadataTabLabel = 'Metadata',
		uploadTabLabel,
		uploadPlaceholder = 'Upload File',
		onFileUpload,
		uploadAccept = 'image/*',
		uploadMaxFiles = 1,
		uploadFieldImage,
		formFields,
		beforeSubmit
	}: {
		open: boolean;
		onOpenChange?: (open: boolean) => void;
		callback?: (recordId: number) => void;
		title: string;
		formId: string;
		formAction: string;
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
	} = $props();

	let formElement: HTMLFormElement;
	let loading = $state(false);
</script>

{#snippet formContent()}
	<form
		id={formId}
		method="POST"
		action={formAction}
		use:enhance={() => {
			// Check if submission should proceed
			if (beforeSubmit && !beforeSubmit()) {
				return () => {}; // Cancel submission
			}

			loading = true;
			return async ({ result, update }) => {
				loading = false;

				if (result.type === 'success') {
					formElement.reset(); // Clear form on success
					await invalidateAll(); // Refresh page data (e.g., song list)

					// Call callback with the created record ID if available
					if (callback && result.data?.id && typeof result.data.id === 'number') {
						callback(result.data.id);
					}
				}

				await update(); // Apply the action result
				open = false;
			};
		}}
		bind:this={formElement}
	>
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
