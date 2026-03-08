<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	let { producerCount = 8 }: { producerCount?: number } = $props();
</script>

<div class="mt-4 flex flex-row flex-wrap gap-4">
	{#each Array(producerCount) as _, i (i)}
		<div class="mb-4 w-[256px] rounded border p-4">
			<Skeleton class="h-4 w-[180px]" />
		</div>
	{/each}
</div>
