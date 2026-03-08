<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { AspectRatio } from '$lib/components/ui/aspect-ratio/index.js';

	let { artistCount = 8 }: { artistCount?: number } = $props();
</script>

<div class="mt-4 flex flex-row flex-wrap gap-4">
	{#each Array(artistCount) as _, i (i)}
		<div class="mb-4 w-[256px] rounded border p-4">
			<AspectRatio ratio={1 / 1} class="bg-muted">
				<Skeleton class="h-full w-full rounded-md" />
			</AspectRatio>
			<Skeleton class="mt-2 h-4 w-[180px]" />
		</div>
	{/each}
</div>
