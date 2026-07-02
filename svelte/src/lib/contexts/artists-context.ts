import type { Artist } from '$lib/ipc';
import { createEntityContext } from './entity-context';

const ctx = createEntityContext<Artist>('artists');

export const setArtistsContext = ctx.set;
export const getArtistsContext = ctx.get;
