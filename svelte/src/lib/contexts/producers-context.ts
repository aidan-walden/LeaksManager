import { getContext, setContext } from 'svelte';
import type { Producer } from '@/server/db/schema';

const PRODUCERS_KEY = Symbol('producers');

type ProducersContextValue<T extends Producer = Producer> = {
	get current(): T[];
};

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
	return ctx?.current ?? [];
}
