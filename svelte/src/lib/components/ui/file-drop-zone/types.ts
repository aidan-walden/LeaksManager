/*
	Installed from @ieedan/shadcn-svelte-extras
*/

import type { WithChildren } from 'bits-ui';
import type { HTMLInputAttributes } from 'svelte/elements';

export type FileRejectedReason =
	| 'Maximum file size exceeded'
	| 'File type not allowed'
	| 'Maximum files uploaded';

export type FileDropZoneLimit = {
	maxFiles: number;
	fileCount: number;
};

export type FileDropZonePropsWithoutHTML = WithChildren<{
	ref?: HTMLInputElement | null;
	/** Called with the selected files. */
	onUpload: (files: File[]) => void | Promise<void>;
	/** Explicit file-count contract when limiting uploads. */
	limit?: FileDropZoneLimit;
	/** Maximum size in bytes. */
	maxFileSize?: number;
	/** Called when a file is rejected. */
	onFileRejected?: (opts: { reason: FileRejectedReason; file: File }) => void;
	/** Whether clicking should open the file picker. */
	clickable?: boolean;
	/** Comma-separated file types passed through to the native input. */
	accept?: string;
}>;

export type FileDropZoneProps = FileDropZonePropsWithoutHTML &
	Omit<HTMLInputAttributes, 'multiple' | 'files'>;
