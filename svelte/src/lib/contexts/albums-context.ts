import { getContext, setContext } from 'svelte';
import type { Album } from '@/server/db/schema';

const ALBUMS_KEY = Symbol('albums');

type AlbumsContextValue<T extends Album = Album> = {
	get current(): T[];
};

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
	return ctx?.current ?? [];
}
