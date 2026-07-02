import type { Album } from '$lib/ipc';
import { createEntityContext } from './entity-context';

const ctx = createEntityContext<Album>('albums');

export const setAlbumsContext = ctx.set;
export const getAlbumsContext = ctx.get;
