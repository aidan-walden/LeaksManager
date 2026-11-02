import { describe, expect, it } from 'vitest';
import { SyncState } from './sync.svelte';

describe('SyncState', () => {
	it('clears changes on successful sync', () => {
		const state = new SyncState();
		state.configure(true, true);

		state.startSync();
		expect(state.isSyncing).toBe(true);

		state.finishSync(true);
		expect(state.hasChanges).toBe(false);
		expect(state.isSyncing).toBe(false);
	});
});
