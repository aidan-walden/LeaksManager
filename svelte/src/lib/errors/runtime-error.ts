import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';

const RUNTIME_ERROR_NOTIFIER_KEY = Symbol('runtime-error-notifier');
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

export class RuntimeErrorNotifier {
	#lastErrorKey = '';
	#lastErrorAt = 0;

	notify(error: unknown, context?: string): void {
		const message = getErrorMessage(error);
		const toastMessage = context ? `${context}: ${message}` : message;
		const now = Date.now();

		if (toastMessage === this.#lastErrorKey && now - this.#lastErrorAt < DEDUPE_WINDOW_MS) {
			return;
		}

		this.#lastErrorKey = toastMessage;
		this.#lastErrorAt = now;

		if (typeof window !== 'undefined') {
			toast.error(toastMessage);
		}
	}

	reset() {
		this.#lastErrorKey = '';
		this.#lastErrorAt = 0;
	}
}

export type RuntimeErrorNotifierLike = Pick<RuntimeErrorNotifier, 'notify' | 'reset'>;

export function createRuntimeErrorNotifier() {
	return new RuntimeErrorNotifier();
}

export function setRuntimeErrorNotifierContext(notifier: RuntimeErrorNotifierLike) {
	setContext(RUNTIME_ERROR_NOTIFIER_KEY, notifier);
	return notifier;
}

export function getRuntimeErrorNotifierContext() {
	const notifier = getContext<RuntimeErrorNotifierLike | undefined>(RUNTIME_ERROR_NOTIFIER_KEY);
	if (!notifier) {
		throw new Error('runtime error notifier context is not available');
	}

	return notifier;
}
