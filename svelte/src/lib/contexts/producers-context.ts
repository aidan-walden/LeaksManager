import type { Producer } from '$lib/ipc';
import { createEntityContext } from './entity-context';

const ctx = createEntityContext<Producer>('producers');

export const setProducersContext = ctx.set;
export const getProducersContext = ctx.get;
