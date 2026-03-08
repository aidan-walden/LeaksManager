import { getContext, setContext } from 'svelte';
import type { Album } from '$lib/wails';

const ALBUMS_KEY = Symbol('albums');

type AlbumsContextValue<T extends Album = Album> = {
	get current(): T[];
};

const MISSING_ALBUMS_CONTEXT = 'Albums context is not available. Wrap the component in the albums provider.';

export function setAlbumsContext<T extends Album>(getValue: () => T[]) {
	const contextValue: AlbumsContextValue<T> = {
		get current() {
			return getValue();
		}
	};

	setContext(ALBUMS_KEY, contextValue);
}

export function getAlbumsContext<T extends Album = Album>(): T[] {
	const ctx = getContext<AlbumsContextValue<T>>(ALBUMS_KEY);
	if (!ctx) {
		throw new Error(MISSING_ALBUMS_CONTEXT);
	}
	return ctx.current;
}
