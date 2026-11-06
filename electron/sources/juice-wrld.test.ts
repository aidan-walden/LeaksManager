import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { juiceWrldSource } from './juice-wrld';

// Shape copied from a live /songs/ response.
function apiSong(over: Record<string, unknown> = {}) {
	return {
		id: 94034,
		name: 'lucid dreams (forget me)',
		category: 'recording_session',
		era: { id: 105, name: 'jw 999', description: 'Juice WRLD 999', time_frame: '', play_count: 1 },
		path: "Compilation/1. Released/Ain't & Co #1.mp3",
		track_titles: ['lucid dreams (forget me)', 'Lucid Dreams'],
		credited_artists: 'Juice WRLD & RoadRunner GDo',
		producers: 'Nick Mira & Unknown',
		engineers: 'N/A',
		recording_locations: '[?]',
		record_dates: 'Recorded\r\nJune 13, 2017.',
		length: '3:59',
		bitrate: '',
		additional_information: '',
		release_date: 'Released\r\nJune 15, 2018.',
		date_leaked: '',
		leak_type: 'Pro Tools Session',
		album: '',
		image_url: '/assets/999.webp',
		notes: '',
		...over
	};
}

describe('juiceWrldSource', () => {
	const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
	const requestedUrl = (call = 0) => new URL(fetchMock.mock.calls[call][0]);

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('browse', () => {
		const respondWith = (results: unknown[], next: string | null = null) =>
			fetchMock.mockResolvedValueOnce(Response.json({ count: 41, next, results }));

		it('converts catalog records to source songs', async () => {
			respondWith([apiSong()], 'http://juicewrldapi.com/juicewrld/songs/?page=2');

			const page = await juiceWrldSource.browse({});

			expect(page).toMatchObject({ totalCount: 41, page: 1, pageSize: 20, hasMore: true });
			expect(page.songs).toEqual([
				{
					sourceId: 'juice-wrld',
					id: '94034',
					name: 'lucid dreams (forget me)',
					alternateTitles: ['Lucid Dreams'],
					artists: ['Juice WRLD', 'RoadRunner GDo'],
					producers: ['Nick Mira'],
					album: null,
					year: 2018,
					duration: 239,
					artworkUrl: 'https://juicewrldapi.com/assets/999.webp',
					downloadable: true,
					details: [
						{ label: 'Category', value: 'recording session' },
						{ label: 'Era', value: 'Juice WRLD 999' },
						{ label: 'Recorded', value: 'Recorded\nJune 13, 2017.' },
						{ label: 'Released', value: 'Released\nJune 15, 2018.' },
						{ label: 'Leak type', value: 'Pro Tools Session' }
					]
				}
			]);
		});

		it('marks a song with no file as not downloadable and handles missing dates', async () => {
			respondWith([apiSong({ path: '', length: '', release_date: '', record_dates: '' })]);

			const { songs, hasMore } = await juiceWrldSource.browse({});

			expect(songs[0]).toMatchObject({ downloadable: false, duration: null, year: null });
			expect(hasMore).toBe(false);
		});

		it('sends search, filters, and paging as API parameters', async () => {
			respondWith([]);

			await juiceWrldSource.browse({
				search: ' nick mira ',
				filters: { category: 'unreleased', era: 'GB&GR', other: 'ignored' },
				page: 3,
				pageSize: 50
			});

			expect(requestedUrl().pathname).toBe('/juicewrld/songs/');
			expect(Object.fromEntries(requestedUrl().searchParams)).toEqual({
				searchall: 'nick mira',
				category: 'unreleased',
				era: 'GB&GR',
				page: '3',
				page_size: '50'
			});
		});

		it.each([
			[{ page: -1, pageSize: 500 }, 1, 100],
			[{ page: 1.5, pageSize: 0 }, 1, 20]
		])('corrects invalid paging %j', async (query, page, pageSize) => {
			respondWith([]);

			const result = await juiceWrldSource.browse(query);

			expect(result).toMatchObject({ page, pageSize });
			expect(requestedUrl().searchParams.get('page')).toBe(String(page));
			expect(requestedUrl().searchParams.get('page_size')).toBe(String(pageSize));
		});

		it('rejects on an API error', async () => {
			fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));

			await expect(juiceWrldSource.browse({})).rejects.toThrow('HTTP 503');
		});
	});

	describe('getFilters', () => {
		it('offers categories and the eras from every API page', async () => {
			const eraPages: Record<string, { results: object[]; next: string | null }> = {
				'1': { results: [{ name: 'jute', description: 'JUICED UP THE EP' }], next: 'http://x/?page=2' },
				'2': { results: [{ name: 'bdm', description: '' }], next: null }
			};
			fetchMock.mockImplementation(async (url) => {
				const parsed = new URL(url);
				return parsed.pathname.endsWith('/categories/')
					? Response.json({ categories: [{ value: 'released', label: 'Released' }] })
					: Response.json(eraPages[parsed.searchParams.get('page')!]);
			});

			expect(await juiceWrldSource.getFilters()).toEqual([
				{
					id: 'category',
					label: 'Category',
					options: [{ value: 'released', label: 'Released' }]
				},
				{
					id: 'era',
					label: 'Era',
					options: [
						{ value: 'jute', label: 'JUICED UP THE EP' },
						{ value: 'bdm', label: 'bdm' }
					]
				}
			]);
		});
	});

	describe('downloadSong', () => {
		it('downloads the file at the path the catalog gives', async () => {
			fetchMock
				.mockResolvedValueOnce(Response.json(apiSong()))
				.mockResolvedValueOnce(new Response('audio'));

			const file = await juiceWrldSource.downloadSong('94034');

			expect(requestedUrl(0).pathname).toBe('/juicewrld/songs/94034/');
			expect(requestedUrl(1).pathname).toBe('/juicewrld/files/download/');
			expect(requestedUrl(1).searchParams.get('path')).toBe(
				"Compilation/1. Released/Ain't & Co #1.mp3"
			);
			expect(file.filename).toBe("Ain't & Co #1.mp3");
			expect(file.song.id).toBe('94034');
			expect(file.size).toBeNull();
			expect(await new Response(file.body).text()).toBe('audio');
		});

		it('gives the file size from Content-Length, unless the response is compressed', async () => {
			const download = async (headers: Record<string, string>) => {
				fetchMock
					.mockResolvedValueOnce(Response.json(apiSong()))
					.mockResolvedValueOnce(new Response('audio', { headers }));
				return (await juiceWrldSource.downloadSong('1')).size;
			};

			expect(await download({ 'content-length': '5' })).toBe(5);
			expect(await download({ 'content-length': '3', 'content-encoding': 'gzip' })).toBeNull();
		});

		it('passes an abort to the file request', async () => {
			const controller = new AbortController();
			fetchMock.mockImplementationOnce(async () => Response.json(apiSong()));
			fetchMock.mockImplementationOnce(
				(_url, init?: RequestInit) =>
					new Promise((_resolve, reject) => {
						init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
						controller.abort(new Error('stopped'));
					})
			);

			await expect(juiceWrldSource.downloadSong('1', controller.signal)).rejects.toThrow('stopped');
		});

		it('rejects an id that could change the request path, without a request', async () => {
			await expect(juiceWrldSource.downloadSong('../stats')).rejects.toThrow('invalid');
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it('rejects a song with no file', async () => {
			fetchMock.mockResolvedValueOnce(Response.json(apiSong({ path: '' })));

			await expect(juiceWrldSource.downloadSong('1')).rejects.toThrow('no downloadable file');
		});

		it('rejects when the file request fails', async () => {
			fetchMock
				.mockResolvedValueOnce(Response.json(apiSong()))
				.mockResolvedValueOnce(new Response('{}', { status: 404 }));

			await expect(juiceWrldSource.downloadSong('1')).rejects.toThrow('HTTP 404');
		});
	});
});
