import { describe, expect, it, vi } from 'vitest';
import { handleCreateCardSuccess } from './create-card';

describe('handleCreateCardSuccess', () => {
	it('awaits the refresh callback after invalidation', async () => {
		const callOrder: string[] = [];
		const callback = vi.fn().mockImplementation(async () => {
			callOrder.push('callback');
		});

		await handleCreateCardSuccess({
			result: { id: 42 },
			resetForm: () => {
				callOrder.push('reset');
			},
			invalidate: async () => {
				callOrder.push('invalidate');
			},
			callback,
			close: () => {
				callOrder.push('close');
			}
		});

		expect(callback).toHaveBeenCalledWith(42);
		expect(callOrder).toEqual(['reset', 'invalidate', 'callback', 'close']);
	});

	it('skips the callback when there is no record id', async () => {
		const callback = vi.fn();

		await handleCreateCardSuccess({
			result: {},
			resetForm: vi.fn(),
			invalidate: vi.fn().mockResolvedValue(undefined),
			callback,
			close: vi.fn()
		});

		expect(callback).not.toHaveBeenCalled();
	});
});
