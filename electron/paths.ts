import { posix, resolve, sep } from 'node:path';

// Port of backend/paths.go — dev/prod path resolution + upload-path traversal guards.
// Trust boundary (FR-015): keep every guard. Stored relpaths use forward slashes
// (e.g. "uploads/songs/123-foo.mp3"); we normalize with path.posix and resolve
// full paths with the native resolver.

export const UPLOADS_ROOT = 'uploads';

// normalizeUploadRelPath keeps upload paths relative to staticPath. Accepts a
// leading slash for backward compatibility (legacy stored values).
export function normalizeUploadRelPath(relPath: string): string {
	let cleaned = posix.normalize(relPath.trim().replace(/\\/g, '/'));
	cleaned = cleaned.replace(/^\/+/, '');

	if (cleaned === '' || cleaned === '.') {
		throw new Error('empty upload path');
	}
	if (posix.isAbsolute(cleaned)) {
		throw new Error(`absolute upload path not allowed: ${relPath}`);
	}
	if (cleaned === '..' || cleaned.startsWith('../')) {
		throw new Error(`path traversal not allowed: ${relPath}`);
	}

	return cleaned;
}

export function normalizeUploadsRootRelPath(relPath: string): string {
	const cleaned = normalizeUploadRelPath(relPath);
	if (cleaned !== UPLOADS_ROOT && !cleaned.startsWith(UPLOADS_ROOT + '/')) {
		throw new Error(`path outside uploads root not allowed: ${relPath}`);
	}
	return cleaned;
}

export function normalizeUploadFilename(filename: string): string {
	const trimmed = filename.trim();
	if (trimmed === '') {
		throw new Error('empty upload filename');
	}
	if (trimmed.includes('\0')) {
		throw new Error(`invalid upload filename: ${JSON.stringify(filename)}`);
	}
	if (/[/\\]/.test(trimmed)) {
		throw new Error(`upload filename must not contain path separators: ${filename}`);
	}
	const cleaned = posix.normalize(trimmed);
	if (cleaned === '.' || cleaned === '..') {
		throw new Error(`invalid upload filename: ${filename}`);
	}
	return cleaned;
}

export function staticFilePath(staticPath: string, relPath: string): string {
	const cleaned = normalizeUploadRelPath(relPath);
	return resolve(staticPath, cleaned);
}

export function uploadsFilePath(staticPath: string, relPath: string): string {
	const cleaned = normalizeUploadsRootRelPath(relPath);
	return staticFilePath(staticPath, cleaned);
}

// newUploadPath generates a timestamped relpath under uploads/{category}/ and its
// resolved full path. Returns both (relPath stored in DB, fullPath for writes).
export function newUploadPath(
	staticPath: string,
	category: string,
	filename: string
): { relPath: string; fullPath: string } {
	const safeFilename = normalizeUploadFilename(filename);
	const relPath = normalizeUploadsRootRelPath(
		posix.join(UPLOADS_ROOT, category, `${Date.now()}-${safeFilename}`)
	);
	return { relPath, fullPath: uploadsFilePath(staticPath, relPath) };
}

// Belt-and-suspenders: confirm a resolved full path stays under staticPath/uploads.
// Mirrors the filepath.Rel check in upload_asset_handler.go.
export function isUnderUploads(staticPath: string, fullPath: string): boolean {
	const root = resolve(staticPath, UPLOADS_ROOT);
	const rel = resolve(fullPath);
	return rel === root || rel.startsWith(root + sep);
}

export type AppEnv = { isPackaged: boolean; userData: string };

// resolveAppPaths mirrors backend/paths.go. Dev (electron-vite, not packaged)
// reuses svelte/local.db so the data is shared with the old stack during migration.
export function resolveAppPaths(env: AppEnv): { dbPath: string; staticPath: string } {
	if (!env.isPackaged) {
		return { dbPath: posix.join('svelte', 'local.db'), staticPath: 'svelte' };
	}
	return { dbPath: resolve(env.userData, 'local.db'), staticPath: env.userData };
}
