import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeErrorNotifier, getErrorMessage } from './runtime-error';

const { toastError } = vi.hoisted(() => ({
	toastError: vi.fn()
}));

vi.mock('svelte-sonner', () => ({
	toast: {
		error: toastError
	}
}));

describe('runtime error helpers', () => {
	let notifier = new RuntimeErrorNotifier();

	beforeEach(() => {
		toastError.mockReset();
		vi.restoreAllMocks();
		notifier = new RuntimeErrorNotifier();
	});

	it('normalizes different error shapes into messages', () => {
		expect(getErrorMessage(new Error('boom'))).toBe('boom');
		expect(getErrorMessage('plain')).toBe('plain');
		expect(getErrorMessage({ code: 1 })).toBe('{"code":1}');
	});

	it('shows repeated runtime toasts', () => {
		notifier.notify(new Error('boom'), 'CreateSong');
		notifier.notify(new Error('boom'), 'CreateSong');

		expect(toastError).toHaveBeenCalledTimes(2);
	});
});
