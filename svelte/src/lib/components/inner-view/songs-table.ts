export function clampSongsPage(page: number, songsCount: number, songsPerPage: number) {
	const lastPage = Math.max(Math.ceil(songsCount / songsPerPage) - 1, 0);
	return Math.min(page, lastPage);
}
