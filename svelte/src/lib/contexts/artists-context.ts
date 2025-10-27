import { getContext, setContext } from 'svelte';
import type { Artist } from '@/server/db/schema';

const ARTISTS_KEY = Symbol('artists');

type ArtistsContextValue<T extends Artist = Artist> = {
	get current(): T[];
};

export function setArtistsContext<T extends Artist>(getValue: () => T[]) {
	const contextValue: ArtistsContextValue<T> = {
		get current() {
			return getValue();
		}
	};
	setContext(ARTISTS_KEY, contextValue);
}

export function getArtistsContext<T extends Artist = Artist>(): T[] {
	const ctx = getContext<ArtistsContextValue<T>>(ARTISTS_KEY);
	return ctx?.current ?? [];
}
