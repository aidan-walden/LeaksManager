export function clampSongsPage(page: number, songsCount: number, songsPerPage: number) {
	const lastPage = Math.max(Math.ceil(songsCount / songsPerPage) - 1, 0);
	return Math.min(page, lastPage);
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
