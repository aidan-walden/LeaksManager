import type { FileDropZoneLimit, FileRejectedReason } from './types';

export function canUploadFiles(
	disabled: boolean,
	uploading: boolean,
	limit?: FileDropZoneLimit
) {
	return !disabled && !uploading && !(limit && limit.fileCount >= limit.maxFiles);
}

export function shouldAcceptFile(
	file: File,
	fileNumber: number,
	options: {
		accept?: string;
		maxFileSize?: number;
		limit?: FileDropZoneLimit;
	}
): FileRejectedReason | undefined {
	if (options.maxFileSize !== undefined && file.size > options.maxFileSize) {
		return 'Maximum file size exceeded';
	}

	if (options.limit && fileNumber > options.limit.maxFiles) {
		return 'Maximum files uploaded';
	}

	if (!options.accept) {
		return undefined;
	}

	const acceptedTypes = options.accept.split(',').map((entry) => entry.trim().toLowerCase());
	const fileType = file.type.toLowerCase();
	const fileName = file.name.toLowerCase();

	const isAcceptable = acceptedTypes.some((pattern) => {
		if (pattern.startsWith('.')) {
			return fileName.endsWith(pattern);
		}

		if (pattern.endsWith('/*')) {
			const baseType = pattern.slice(0, pattern.indexOf('/*'));
			return fileType.startsWith(baseType + '/');
		}

		return fileType === pattern;
	});

	return isAcceptable ? undefined : 'File type not allowed';
}

export function shouldAllowMultiple(limit?: FileDropZoneLimit) {
	return !limit || limit.maxFiles-limit.fileCount > 1;
}
