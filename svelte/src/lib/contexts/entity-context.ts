import { getContext, setContext } from 'svelte';

export function createEntityContext<TBase>(label: string) {
	const KEY = Symbol(label);
	const missing = `${label} context is not available. Wrap the component in the ${label} provider.`;

	type Ctx<T extends TBase> = { get current(): T[] };

	function set<T extends TBase>(getValue: () => T[]) {
		setContext(KEY, {
			get current() {
				return getValue();
			}
		} satisfies Ctx<T>);
	}

	function get<T extends TBase>(): T[] {
		const ctx = getContext<Ctx<T>>(KEY);
		if (!ctx) {
			throw new Error(missing);
		}
		return ctx.current;
	}

	return { set, get };
}
