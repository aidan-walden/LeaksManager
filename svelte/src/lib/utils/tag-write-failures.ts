import { toast } from 'svelte-sonner';
import type { BatchResult } from '$lib/ipc';

// The database save succeeded, but some files keep their old tags. Tell the user.
export function notifyTagWriteFailures({ songsFailed }: BatchResult) {
	if (songsFailed > 0) {
		toast.error(`Could not write tags to ${songsFailed} ${songsFailed === 1 ? 'song' : 'songs'}`);
	}
}
