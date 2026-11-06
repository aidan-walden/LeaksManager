import { createWriteStream, writeFileSync, rmSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
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

// Streams to disk so a large download is not held in memory. A failed save leaves no file.
export async function saveStream(
	staticPath: string,
	category: string,
	filename: string,
	body: ReadableStream<Uint8Array>,
	onBytes?: (byteCount: number) => void
): Promise<string> {
	const { relPath, fullPath } = newUploadPath(staticPath, category, filename);
	try {
		await pipeline(
			Readable.fromWeb(body as NodeReadableStream),
			async function* (chunks: AsyncIterable<Uint8Array>) {
				for await (const chunk of chunks) {
					onBytes?.(chunk.length);
					yield chunk;
				}
			},
			createWriteStream(fullPath)
		);
	} catch (err) {
		rmSync(fullPath, { force: true });
		throw err;
	}
	return relPath;
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
