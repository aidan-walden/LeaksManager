import { getRawIpcBindings } from '$lib/ipc';

export const ssr = false;
export const prerender = false;
export const trailingSlash = 'always';

export const load = () => getRawIpcBindings().GetInitialData();
