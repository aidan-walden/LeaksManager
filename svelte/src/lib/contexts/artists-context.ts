import { getContext, setContext } from 'svelte';
import type { Artist } from '@/server/db/schema';

const ARTISTS_KEY = Symbol('artists');

export function setArtistsContext(artists: Artist[]) {
	setContext(ARTISTS_KEY, artists);
}

export function getArtistsContext(): Artist[] {
	return getContext(ARTISTS_KEY);
}
