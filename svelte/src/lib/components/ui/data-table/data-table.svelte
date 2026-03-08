<script lang="ts" generics="TData, TValue">
	import {
		type ColumnDef,
		type PaginationState,
		getCoreRowModel,
		getPaginationRowModel
	} from '@tanstack/table-core';
	import FlexRender from '$lib/components/ui/data-table/flex-render.svelte';
	import { createSvelteTable } from '$lib/components/ui/data-table/data-table.svelte.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	type DataTableProps<TData, TValue> = {
		columns: ColumnDef<TData, TValue>[];
		data: TData[];
		pageSize?: number;
	} & (
		| {
				pagination?: undefined;
			}
		| {
				pagination: {
					pageIndex: number;
					pageSize: number;
					totalCount: number;
				};
				onPaginationChange: (nextPageIndex: number) => void;
			}
	);

	let props: DataTableProps<TData, TValue> = $props();

	let {
		data,
		columns,
		pageSize = 10,
		pagination: controlledPagination
	} = props;

	const onPaginationChange = 'onPaginationChange' in props ? props.onPaginationChange : undefined;

	let pagination = $state<PaginationState>({
		pageIndex: controlledPagination?.pageIndex ?? 0,
		pageSize: controlledPagination?.pageSize ?? pageSize
	});

	$effect(() => {
		if (!controlledPagination) {
			return;
		}

		pagination = {
			pageIndex: controlledPagination.pageIndex,
			pageSize: controlledPagination.pageSize
		};
	});

	const table = createSvelteTable({
		get data() {
			return data;
		},
		columns,
		...(controlledPagination
			? {
					manualPagination: true,
					pageCount: Math.ceil(controlledPagination.totalCount / controlledPagination.pageSize)
				}
			: {}),
		state: {
			get pagination() {
				return pagination;
			}
		},
		onPaginationChange: (updater) => {
			if (typeof updater === 'function') {
				pagination = updater(pagination);
			} else {
				pagination = updater;
			}
		},
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel()
	});

	function handleNextPage() {
		if (controlledPagination) {
			onPaginationChange?.(pagination.pageIndex + 1);
		} else {
			table.nextPage();
		}
	}

	function handlePreviousPage() {
		if (controlledPagination) {
			onPaginationChange?.(pagination.pageIndex - 1);
		} else {
			table.previousPage();
		}
	}

	const canNext = $derived(
		controlledPagination
			? pagination.pageIndex + 1 <
				Math.ceil(controlledPagination.totalCount / controlledPagination.pageSize)
			: table.getCanNextPage()
	);
	const canPrevious = $derived(
		controlledPagination ? pagination.pageIndex > 0 : table.getCanPreviousPage()
	);
</script>

<div class="rounded-md border">
	<Table.Root>
		<Table.Header>
			{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
				<Table.Row>
					{#each headerGroup.headers as header (header.id)}
						<Table.Head colspan={header.colSpan}>
							{#if !header.isPlaceholder}
								<FlexRender
									content={header.column.columnDef.header}
									context={header.getContext()}
								/>
							{/if}
						</Table.Head>
					{/each}
				</Table.Row>
			{/each}
		</Table.Header>
		<Table.Body>
			{#each table.getRowModel().rows as row (row.id)}
				<Table.Row data-state={row.getIsSelected() && 'selected'}>
					{#each row.getVisibleCells() as cell (cell.id)}
						<Table.Cell>
							<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
						</Table.Cell>
					{/each}
				</Table.Row>
			{:else}
				<Table.Row>
					<Table.Cell colspan={columns.length} class="h-24 text-center">No results.</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
<div class="flex items-center justify-end space-x-2 py-4">
	<Button variant="outline" size="sm" onclick={handlePreviousPage} disabled={!canPrevious}>
		Previous
	</Button>
	<Button variant="outline" size="sm" onclick={handleNextPage} disabled={!canNext}>
		Next
	</Button>
</div>
