import { json } from '@sveltejs/kit';
import { getSongsReadable } from '$lib/server/db/helpers';

export async function GET({ url }) {
	const page = parseInt(url.searchParams.get('page') ?? '0');
	const pageSize = parseInt(url.searchParams.get('pageSize') ?? '25');

	const offset = page * pageSize;
	const songs = await getSongsReadable({ limit: pageSize, offset });

	return json(songs);
}
