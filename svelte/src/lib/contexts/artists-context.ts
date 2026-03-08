import { getContext, setContext } from 'svelte';
import type { Artist } from '$lib/wails';

const ARTISTS_KEY = Symbol('artists');

type ArtistsContextValue<T extends Artist = Artist> = {
	get current(): T[];
};

const MISSING_ARTISTS_CONTEXT = 'Artists context is not available. Wrap the component in the artists provider.';

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
	if (!ctx) {
		throw new Error(MISSING_ARTISTS_CONTEXT);
	}
	return ctx.current;
}
