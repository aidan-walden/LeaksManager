<script lang="ts">
	import * as Table from '$lib/components/ui/table/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	let { rowCount = 10 }: { rowCount?: number } = $props();
</script>

<div class="rounded-md border">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Title</Table.Head>
				<Table.Head>Artist</Table.Head>
				<Table.Head>Album</Table.Head>
				<Table.Head></Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each Array(rowCount) as _, i (i)}
				<Table.Row>
					<Table.Cell>
						<Skeleton class="h-4 w-[200px]" />
					</Table.Cell>
					<Table.Cell>
						<Skeleton class="h-4 w-[150px]" />
					</Table.Cell>
					<Table.Cell>
						<Skeleton class="h-4 w-[180px]" />
					</Table.Cell>
					<Table.Cell>
						<Skeleton class="h-8 w-8 rounded-md" />
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
