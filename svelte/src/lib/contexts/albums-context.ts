import type { Album } from '$lib/wails';
import { createEntityContext } from './entity-context';

const ctx = createEntityContext<Album>('albums');

export const setAlbumsContext = ctx.set;
export const getAlbumsContext = ctx.get;
