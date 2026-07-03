import { createReadStream, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { protocol } from 'electron';
import { isUnderUploads, uploadsFilePath } from './paths';

// Port of upload_asset_handler.go: serve uploaded audio/artwork over a custom
// protocol `app://uploads/<relPath>` instead of an HTTP asset middleware.
// FR-015 trust boundary — keep every traversal guard.

const SCHEME = 'app';

const MIME: Record<string, string> = {
	'.mp3': 'audio/mpeg',
	'.m4a': 'audio/mp4',
	'.mp4': 'audio/mp4',
	'.flac': 'audio/flac',
	'.ogg': 'audio/ogg',
	'.oga': 'audio/ogg',
	'.wav': 'audio/wav',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp'
};

// Must run BEFORE app.whenReady (Electron requirement for privileged schemes).
export function registerAppProtocolScheme(): void {
	protocol.registerSchemesAsPrivileged([
		{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
	]);
}

// Run after whenReady. Resolves `app://uploads/...` to a file under staticPath.
export function registerAppProtocol(staticPath: string): void {
	protocol.handle(SCHEME, (request) => {
		try {
			const url = new URL(request.url);
			// app://uploads/songs/x.mp3 → host="uploads", pathname="/songs/x.mp3"
			const relPath = decodeURIComponent(url.host + url.pathname);

			const fullPath = uploadsFilePath(staticPath, relPath); // throws on traversal
			if (!isUnderUploads(staticPath, fullPath) || !statSync(fullPath).isFile()) {
				return new Response('Not found', { status: 404 });
			}

			const body = Readable.toWeb(createReadStream(fullPath)) as ReadableStream<Uint8Array>;
			const type = MIME[extname(fullPath).toLowerCase()] ?? 'application/octet-stream';
			return new Response(body, { headers: { 'Content-Type': type } });
		} catch {
			return new Response('Not found', { status: 404 });
		}
	});
}
