import { writeFileSync, rmSync } from 'node:fs';
import { newUploadPath, uploadsFilePath } from './paths';

// Port of backend/files.go. Free functions taking staticPath (no App receiver).
// uploadAlbumArt's DB write belongs to the albums domain (US1); only the file-save
// half lives here.

export function saveBase64(
	staticPath: string,
	category: string,
	filename: string,
	base64Data: string
): string {
	const data = Buffer.from(base64Data, 'base64');
	const { relPath, fullPath } = newUploadPath(staticPath, category, filename);
	writeFileSync(fullPath, data);
	return relPath;
}

export function saveUploadedFile(staticPath: string, filename: string, base64Data: string): string {
	return saveBase64(staticPath, 'songs', filename, base64Data);
}

export function saveArtwork(staticPath: string, filename: string, base64Data: string): string {
	return saveBase64(staticPath, 'artwork', filename, base64Data);
}

export function deleteFile(staticPath: string, relPath: string): void {
	rmSync(uploadsFilePath(staticPath, relPath));
}

export function cleanupFiles(staticPath: string, relPaths: string[]): number {
	let deleted = 0;
	for (const relPath of relPaths) {
		try {
			deleteFile(staticPath, relPath);
			deleted++;
		} catch {
			// best-effort, mirror Go (count only successes)
		}
	}
	return deleted;
}
