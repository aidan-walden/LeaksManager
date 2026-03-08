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

	it('tracks sync progress and clears it on success', () => {
		const state = new SyncState();
		state.configure(true, true);

		state.startSync();
		state.updateProgress(1, 4);
		expect(state.progressPercent).toBe(25);

		state.finishSync(true);
		expect(state.hasChanges).toBe(false);
		expect(state.syncProgress).toBeNull();
	});
});
