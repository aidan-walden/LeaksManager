import { describe, expect, it } from 'vitest';
import { ACCEPT_AUDIO, BYTE, formatFileSize, GIGABYTE, KILOBYTE, MEGABYTE } from './index';
import {
	canUploadFiles,
	shouldAcceptFile,
	shouldAllowMultiple
} from './file-drop-zone-helpers';

describe('file drop zone helpers', () => {
	it('formats file sizes across units', () => {
		expect(formatFileSize(BYTE)).toBe('1 B');
		expect(formatFileSize(KILOBYTE)).toBe('1 KB');
		expect(formatFileSize(MEGABYTE)).toBe('1 MB');
		expect(formatFileSize(GIGABYTE)).toBe('1 GB');
	});

	it('exports shared accept constants', () => {
		expect(ACCEPT_AUDIO).toBe('audio/*');
	});

	it('rejects files by type, size, and limit before upload', () => {
		const audio = new File(['ok'], 'track.mp3', { type: 'audio/mpeg' });
		const image = new File(['img'], 'cover.png', { type: 'image/png' });

		expect(
			shouldAcceptFile(audio, 1, {
				accept: 'audio/*',
				maxFileSize: 10,
				limit: { maxFiles: 1, fileCount: 0 }
			})
		).toBeUndefined();
		expect(
			shouldAcceptFile(image, 1, {
				accept: 'audio/*'
			})
		).toBe('File type not allowed');
		expect(
			shouldAcceptFile(new File(['01234567890'], 'large.mp3', { type: 'audio/mpeg' }), 1, {
				maxFileSize: 5
			})
		).toBe('Maximum file size exceeded');
		expect(
			shouldAcceptFile(audio, 2, {
				limit: { maxFiles: 1, fileCount: 1 }
			})
		).toBe('Maximum files uploaded');
	});

	it('computes upload availability and multiple-selection behavior from limit state', () => {
		expect(canUploadFiles(false, false, { maxFiles: 2, fileCount: 1 })).toBe(true);
		expect(canUploadFiles(true, false, { maxFiles: 2, fileCount: 1 })).toBe(false);
		expect(canUploadFiles(false, true, { maxFiles: 2, fileCount: 1 })).toBe(false);
		expect(canUploadFiles(false, false, { maxFiles: 1, fileCount: 1 })).toBe(false);
		expect(shouldAllowMultiple(undefined)).toBe(true);
		expect(shouldAllowMultiple({ maxFiles: 2, fileCount: 0 })).toBe(true);
		expect(shouldAllowMultiple({ maxFiles: 1, fileCount: 0 })).toBe(false);
	});
});
