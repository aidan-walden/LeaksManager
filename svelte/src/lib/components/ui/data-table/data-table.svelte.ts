import {
	type RowData,
	type TableOptions,
	type TableOptionsResolved,
	type TableState,
	type Updater,
	createTable
} from '@tanstack/table-core';

export function createSvelteTable<TData extends RowData>(options: TableOptions<TData>) {
	const resolvedOptions: TableOptionsResolved<TData> = {
		state: {},
		onStateChange() {},
		renderFallbackValue: null,
		mergeOptions: (defaultOptions: TableOptions<TData>, nextOptions: Partial<TableOptions<TData>>) => {
			return mergeObjects(defaultOptions, nextOptions);
		},
		...options
	};

	const table = createTable(resolvedOptions);
	let state = $state<Partial<TableState>>(table.initialState);

	function updateOptions() {
		table.setOptions((prev) => {
			const nextTableState = {
				...state,
				...(options.state ?? {})
			};

			const nextOptions = {
				...prev,
				...options,
				state: nextTableState,
				onStateChange: (updater: Updater<TableState>) => {
					const nextState = typeof updater === 'function' ? updater(state as TableState) : updater;
					state = {
						...state,
						...nextState
					};

					options.onStateChange?.(updater);
				}
			};

			return nextOptions;
		});
	}

	updateOptions();

	$effect.pre(() => {
		updateOptions();
	});

	return table;
}

type MaybeThunk<T extends object> = T | (() => T | null | undefined);
type Intersection<T extends readonly unknown[]> = (T extends [infer H, ...infer R]
	? H & Intersection<R>
	: unknown) & {};

/**
 * Proxy-based to preserve getter semantics and avoid a WebKit recursion bug.
 */
export function mergeObjects<Sources extends readonly MaybeThunk<object>[]>(
	...sources: Sources
): Intersection<{ [K in keyof Sources]: Sources[K] }> {
	const resolve = <T extends object>(src: MaybeThunk<T>): T | undefined =>
		typeof src === "function" ? (src() ?? undefined) : src;

	const findSourceWithKey = (key: PropertyKey) => {
		for (let i = sources.length - 1; i >= 0; i--) {
			const obj = resolve(sources[i]);
			if (obj && key in obj) return obj;
		}
		return undefined;
	};

	return new Proxy(Object.create(null), {
		get(_, key) {
			const src = findSourceWithKey(key);

			return src?.[key as never];
		},

		has(_, key) {
			return !!findSourceWithKey(key);
		},

		ownKeys(): (string | symbol)[] {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const all = new Set<string | symbol>();
			for (const s of sources) {
				const obj = resolve(s);
				if (obj) {
					for (const k of Reflect.ownKeys(obj) as (string | symbol)[]) {
						all.add(k);
					}
				}
			}
			return [...all];
		},

		getOwnPropertyDescriptor(_, key) {
			const src = findSourceWithKey(key);
			if (!src) return undefined;
			return {
				configurable: true,
				enumerable: true,
				value: Reflect.get(src, key),
				writable: true
			};
		}
	}) as Intersection<{ [K in keyof Sources]: Sources[K] }>;
}
