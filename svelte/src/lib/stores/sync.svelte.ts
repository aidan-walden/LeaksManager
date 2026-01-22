export class SyncState {
    hasChanges = $state(false);
    isDismissed = $state(false);

    markChanged() {
        this.hasChanges = true;
    }

    dismiss() {
        this.isDismissed = true;
    }

    get shouldShow() {
        return this.hasChanges && !this.isDismissed;
    }
}

export const syncState = new SyncState();