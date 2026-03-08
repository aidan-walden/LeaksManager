export function clampSongsPage(page: number, songsCount: number, songsPerPage: number) {
	const lastPage = Math.max(Math.ceil(songsCount / songsPerPage) - 1, 0);
	return Math.min(page, lastPage);
}

type SongsPageProps<T> = {
	songs: T[];
	songsCount: number;
};

export function getSongsPagePropSyncMode<T>(
	currentPage: number,
	previousProps: SongsPageProps<T> | null,
	nextProps: SongsPageProps<T>
) {
	if (
		previousProps &&
		previousProps.songs === nextProps.songs &&
		previousProps.songsCount === nextProps.songsCount
	) {
		return 'none' as const;
	}

	if (!previousProps) {
		return 'none' as const;
	}

	return currentPage === 0 ? ('replace-visible' as const) : ('refresh-current-page' as const);
}

export function removeSongFromPage<T extends { id: number }>(rows: T[], songId: number) {
	return rows.filter((row) => row.id !== songId);
}

export function replaceSongInPage<T extends { id: number }>(rows: T[], updatedRow: T) {
	return rows.map((row) => (row.id === updatedRow.id ? updatedRow : row));
}

export function mergeIncomingPageRows<T>(incomingRows: T[], currentRows: T[], pageSize: number) {
	return [...incomingRows, ...currentRows].slice(0, pageSize);
}
