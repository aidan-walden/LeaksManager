import { describe, expect, it } from 'vitest';
import { SyncState } from './sync.svelte';

describe('SyncState', () => {
	it('marks changes only when Apple Music is enabled', () => {
		const state = new SyncState();

		state.markChanged();
		expect(state.hasChanges).toBe(false);

		state.configure(true, false);
		state.markChanged();
		expect(state.hasChanges).toBe(true);
	});

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
