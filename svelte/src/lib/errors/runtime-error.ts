import { toast } from 'svelte-sonner';

let lastErrorKey = '';
let lastErrorAt = 0;
const DEDUPE_WINDOW_MS = 1500;

export function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	if (typeof error === 'string' && error.trim().length > 0) {
		return error;
	}
	if (error && typeof error === 'object') {
		try {
			return JSON.stringify(error);
		} catch {
			return 'Unknown runtime error';
		}
	}

	return 'Unknown runtime error';
}

export function notifyRuntimeError(error: unknown, context?: string): void {
	const message = getErrorMessage(error);
	const toastMessage = context ? `${context}: ${message}` : message;
	const now = Date.now();

	if (toastMessage === lastErrorKey && now - lastErrorAt < DEDUPE_WINDOW_MS) {
		return;
	}

	lastErrorKey = toastMessage;
	lastErrorAt = now;

	if (typeof window !== 'undefined') {
		toast.error(toastMessage);
	}

	console.error(context ? `Runtime error (${context})` : 'Runtime error', error);
}
