import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getErrorMessage, notifyRuntimeError } from './runtime-error';

const { toastError } = vi.hoisted(() => ({
	toastError: vi.fn()
}));

vi.mock('svelte-sonner', () => ({
	toast: {
		error: toastError
	}
}));

describe('runtime error helpers', () => {
	beforeEach(() => {
		toastError.mockReset();
		vi.restoreAllMocks();
	});

	it('normalizes different error shapes into messages', () => {
		expect(getErrorMessage(new Error('boom'))).toBe('boom');
		expect(getErrorMessage('plain')).toBe('plain');
		expect(getErrorMessage({ code: 1 })).toBe('{"code":1}');
	});

	it('deduplicates repeated runtime toasts in a short window', () => {
		vi.useFakeTimers();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		notifyRuntimeError(new Error('boom'), 'CreateSong');
		notifyRuntimeError(new Error('boom'), 'CreateSong');

		expect(toastError).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalledTimes(1);

		vi.useRealTimers();
	});
});
