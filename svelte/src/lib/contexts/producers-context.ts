import { getContext, setContext } from 'svelte';
import type { Producer } from '$lib/wails';

const PRODUCERS_KEY = Symbol('producers');

type ProducersContextValue<T extends Producer = Producer> = {
	get current(): T[];
};

const MISSING_PRODUCERS_CONTEXT =
	'Producers context is not available. Wrap the component in the producers provider.';

export function setProducersContext<T extends Producer>(getValue: () => T[]) {
	const contextValue: ProducersContextValue<T> = {
		get current() {
			return getValue();
		}
	};
	setContext(PRODUCERS_KEY, contextValue);
}

export function getProducersContext<T extends Producer = Producer>(): T[] {
	const ctx = getContext<ProducersContextValue<T>>(PRODUCERS_KEY);
	if (!ctx) {
		throw new Error(MISSING_PRODUCERS_CONTEXT);
	}
	return ctx.current;
}
