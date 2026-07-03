import { toast } from 'svelte-sonner';

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
	notify(error: unknown, context?: string): void {
		const message = getErrorMessage(error);
		const toastMessage = context ? `${context}: ${message}` : message;

		if (typeof window !== 'undefined') {
			toast.error(toastMessage);
		}
	}
}
