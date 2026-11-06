import { posix } from 'node:path';
import type {
	SourceBrowseQuery,
	SourceFilter,
	SourceSong,
	SourceSongDetail,
	SourceSongPage
} from '../domain/models';
import { parseArtists } from '../domain/artists';
import type { SongSource, SourceSongFile } from './song-source';

// Client for https://juicewrldapi.com/api-docs. The docs omit some behavior that this
// code relies on, which was observed on the live API:
// - page_size is silently capped: 100 for songs, 20 for eras.
// - `next` links use http://, so pages are requested by number instead.
// - `path` is empty when the catalog has no file for the song.

const ORIGIN = 'https://juicewrldapi.com';
const API_BASE = `${ORIGIN}/juicewrld`;
const SOURCE_ID = 'juice-wrld';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

interface ApiPage<T> {
	count: number;
	next: string | null;
	results: T[];
}

interface ApiEra {
	name: string;
	description: string;
}

interface ApiCategory {
	value: string;
	label: string;
}

interface ApiSong {
	id: number;
	name: string;
	category: string;
	era: ApiEra | null;
	path: string;
	track_titles: string[];
	credited_artists: string;
	producers: string;
	engineers: string;
	recording_locations: string;
	record_dates: string;
	length: string;
	bitrate: string;
	additional_information: string;
	release_date: string;
	date_leaked: string;
	leak_type: string;
	album?: string;
	image_url: string;
	notes: string;
}

function apiUrl(path: string, params: Record<string, string> = {}): string {
	const url = new URL(`${API_BASE}${path}`);
	url.search = new URLSearchParams(params).toString();
	return url.href;
}

async function request(url: string, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
	const timeout = AbortSignal.timeout(timeoutMs);
	const response = await fetch(url, {
		signal: signal ? AbortSignal.any([signal, timeout]) : timeout
	});
	if (!response.ok) {
		throw new Error(`Juice WRLD API returned HTTP ${response.status} for ${url}`);
	}
	return response;
}

async function getJson<T>(
	path: string,
	params?: Record<string, string>,
	signal?: AbortSignal
): Promise<T> {
	const response = await request(apiUrl(path, params), REQUEST_TIMEOUT_MS, signal);
	return (await response.json()) as T;
}

// The catalog writes missing values as empty strings or placeholders.
function cleanText(value: string | null | undefined): string | null {
	const text = value?.replace(/\r\n/g, '\n').trim();
	return !text || /^(n\/a|unknown|\[\?\])$/i.test(text) ? null : text;
}

function parseCredits(value: string): string[] {
	return parseArtists(value).filter((name) => cleanText(name) !== null);
}

function parseYear(...values: string[]): number | null {
	for (const value of values) {
		const match = value.match(/\b(?:19|20)\d{2}\b/);
		if (match) return Number(match[0]);
	}
	return null;
}

function parseDuration(length: string): number | null {
	if (!/^\d+(:\d{1,2})+$/.test(length.trim())) return null;
	return length
		.trim()
		.split(':')
		.reduce((total, part) => total * 60 + Number(part), 0);
}

function toDetails(song: ApiSong): SourceSongDetail[] {
	const details: [string, string | null | undefined][] = [
		['Category', song.category.replace(/_/g, ' ')],
		['Era', song.era?.description || song.era?.name],
		['Recorded', song.record_dates],
		['Released', song.release_date],
		['Recording location', song.recording_locations],
		['Engineers', song.engineers],
		['Bitrate', song.bitrate],
		['Leak type', song.leak_type],
		['Leaked', song.date_leaked],
		['Additional information', song.additional_information],
		['Notes', song.notes]
	];
	return details.flatMap(([label, raw]) => {
		const value = cleanText(raw);
		return value ? [{ label, value }] : [];
	});
}

function toSourceSong(song: ApiSong): SourceSong {
	return {
		sourceId: SOURCE_ID,
		id: String(song.id),
		name: song.name,
		alternateTitles: song.track_titles.filter((title) => title !== song.name),
		artists: parseCredits(song.credited_artists),
		producers: parseCredits(song.producers),
		album: cleanText(song.album),
		year: parseYear(song.release_date, song.record_dates),
		duration: parseDuration(song.length),
		artworkUrl: song.image_url ? new URL(song.image_url, ORIGIN).href : null,
		downloadable: song.path !== '',
		details: toDetails(song)
	};
}

function toPositiveInt(value: number | undefined, fallback: number): number {
	return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

async function getAllEras(): Promise<ApiEra[]> {
	const eras: ApiEra[] = [];
	for (let page = 1; ; page++) {
		const data = await getJson<ApiPage<ApiEra>>('/eras/', { page: String(page) });
		eras.push(...data.results);
		if (!data.next) return eras;
	}
}

export const juiceWrldSource: SongSource = {
	id: SOURCE_ID,
	name: 'Juice WRLD API',
	imageOrigins: [ORIGIN],

	async getFilters(): Promise<SourceFilter[]> {
		const [{ categories }, eras] = await Promise.all([
			getJson<{ categories: ApiCategory[] }>('/categories/'),
			getAllEras()
		]);
		return [
			{ id: 'category', label: 'Category', options: categories },
			{
				id: 'era',
				label: 'Era',
				options: eras.map((era) => ({ value: era.name, label: era.description || era.name }))
			}
		];
	},

	async browse(query: SourceBrowseQuery): Promise<SourceSongPage> {
		const page = toPositiveInt(query.page, 1);
		const pageSize = Math.min(toPositiveInt(query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
		const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
		const search = query.search?.trim();
		// searchall also matches producers; the docs' `search` parameter does not.
		if (search) params.searchall = search;
		if (query.filters?.category) params.category = query.filters.category;
		if (query.filters?.era) params.era = query.filters.era;

		const data = await getJson<ApiPage<ApiSong>>('/songs/', params);
		return {
			songs: data.results.map(toSourceSong),
			totalCount: data.count,
			page,
			pageSize,
			hasMore: data.next !== null
		};
	},

	async downloadSong(songId: string, signal?: AbortSignal): Promise<SourceSongFile> {
		if (!/^\d+$/.test(songId)) throw new Error(`invalid Juice WRLD song id: ${songId}`);

		const song = await getJson<ApiSong>(`/songs/${songId}/`, undefined, signal);
		if (!song.path) throw new Error(`"${song.name}" has no downloadable file`);

		const response = await request(
			apiUrl('/files/download/', { path: song.path }),
			DOWNLOAD_TIMEOUT_MS,
			signal
		);
		if (!response.body) throw new Error(`empty download for "${song.name}"`);
		// fetch decompresses the body, so a compressed response's length is not the body's size.
		const contentLength = response.headers.get('content-encoding')
			? null
			: Number(response.headers.get('content-length'));
		return {
			song: toSourceSong(song),
			filename: posix.basename(song.path),
			size: contentLength || null,
			body: response.body
		};
	}
};
