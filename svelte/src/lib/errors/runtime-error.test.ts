import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeErrorNotifier, getErrorMessage } from './runtime-error';

const { toastError } = vi.hoisted(() => ({
	toastError: vi.fn()
}));

vi.mock('svelte-sonner', () => ({
	toast: {
		error: toastError
	}
}));

describe('runtime error helpers', () => {
	let notifier = createRuntimeErrorNotifier();

	beforeEach(() => {
		toastError.mockReset();
		vi.restoreAllMocks();
		notifier = createRuntimeErrorNotifier();
	});

	it('normalizes different error shapes into messages', () => {
		expect(getErrorMessage(new Error('boom'))).toBe('boom');
		expect(getErrorMessage('plain')).toBe('plain');
		expect(getErrorMessage({ code: 1 })).toBe('{"code":1}');
	});

	it('deduplicates repeated runtime toasts in a short window', () => {
		vi.useFakeTimers();

		notifier.notify(new Error('boom'), 'CreateSong');
		notifier.notify(new Error('boom'), 'CreateSong');

		expect(toastError).toHaveBeenCalledTimes(1);

		vi.useRealTimers();
	});
});
