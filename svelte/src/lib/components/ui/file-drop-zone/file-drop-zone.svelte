<!--
	Installed from @ieedan/shadcn-svelte-extras
-->

<script lang="ts">
	import { cn } from '$lib/utils';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { formatFileSize } from './file-drop-zone-constants';
	import {
		canUploadFiles as getCanUploadFiles,
		shouldAcceptFile,
		shouldAllowMultiple
	} from './file-drop-zone-helpers';
	import { useId } from 'bits-ui';
	import type { FileDropZoneProps } from './types';

	let {
		id = useId(),
		children,
		limit,
		maxFileSize,
		disabled = false,
		clickable = true,
		onUpload,
		onFileRejected,
		accept,
		class: className,
		...rest
	}: FileDropZoneProps = $props();

	let uploading = $state(false);

	const drop = async (
		e: DragEvent & {
			currentTarget: EventTarget & (HTMLLabelElement | HTMLDivElement);
		}
	) => {
		if (disabled || !canUploadFiles) return;

		e.preventDefault();

		const droppedFiles = Array.from(e.dataTransfer?.files ?? []);

		await upload(droppedFiles);
	};

	const change = async (
		e: Event & {
			currentTarget: EventTarget & HTMLInputElement;
		}
	) => {
		if (disabled) return;

		const selectedFiles = e.currentTarget.files;

		if (!selectedFiles) return;

		await upload(Array.from(selectedFiles));

		// this if a file fails and we upload the same file again we still get feedback
		(e.target as HTMLInputElement).value = '';
	};

	const upload = async (uploadFiles: File[]) => {
		uploading = true;

		const validFiles: File[] = [];

		for (let i = 0; i < uploadFiles.length; i++) {
			const file = uploadFiles[i];

			const rejectedReason = shouldAcceptFile(file, (limit?.fileCount ?? 0) + i + 1, {
				accept,
				maxFileSize,
				limit
			});

			if (rejectedReason) {
				onFileRejected?.({ file, reason: rejectedReason });
				continue;
			}

			validFiles.push(file);
		}

		try {
			await onUpload(validFiles);
		} finally {
			uploading = false;
		}
	};

	const canUploadFiles = $derived(getCanUploadFiles(disabled ?? false, uploading, limit));
</script>

{#if clickable}
	<label
		ondragover={(e) => e.preventDefault()}
		ondrop={drop}
		for={id}
		aria-disabled={!canUploadFiles}
		class={cn(
			'flex h-48 w-full place-items-center justify-center rounded-lg border-2 border-dashed border-border p-6 transition-all hover:cursor-pointer hover:bg-accent/25 aria-disabled:opacity-50 aria-disabled:hover:cursor-not-allowed',
			className
		)}
	>
		{#if children}
			{@render children()}
		{:else}
			<div class="flex flex-col place-items-center justify-center gap-2">
				<div
					class="flex size-14 place-items-center justify-center rounded-full border border-dashed border-border text-muted-foreground"
				>
					<UploadIcon class="size-7" />
				</div>
				<div class="flex flex-col gap-0.5 text-center">
					<span class="font-medium text-muted-foreground">
						Drag 'n' drop files here, or click to select files
					</span>
					{#if limit || maxFileSize}
						<span class="text-sm text-muted-foreground/75">
							{#if limit}
								<span>You can upload {limit.maxFiles} files</span>
							{/if}
							{#if limit && maxFileSize}
								<span>(up to {formatFileSize(maxFileSize)} each)</span>
							{/if}
							{#if maxFileSize && !limit}
								<span>Maximum size {formatFileSize(maxFileSize)}</span>
							{/if}
						</span>
					{/if}
				</div>
			</div>
		{/if}
		<input
			{...rest}
			disabled={!canUploadFiles}
			{id}
			{accept}
			multiple={shouldAllowMultiple(limit)}
			type="file"
			onchange={change}
			class="hidden"
		/>
	</label>
{:else}
	<div
		role="region"
		ondragover={(e) => e.preventDefault()}
		ondrop={drop}
		class={cn(
			'flex h-48 w-full place-items-center justify-center rounded-lg border-2 border-dashed border-border p-6 transition-all',
			!canUploadFiles && 'opacity-50',
			className
		)}
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}
