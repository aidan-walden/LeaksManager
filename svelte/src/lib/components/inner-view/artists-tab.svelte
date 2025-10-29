<script lang="ts">
	import { AspectRatio } from '$lib/components/ui/aspect-ratio/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import CreateArtistCard from '$lib/components/ui/create-artist-card.svelte';
	import ArtistsSkeleton from '$lib/components/ui/artists-skeleton.svelte';
	import type { Artist } from '$lib/server/db/schema';
	import type { PageData } from '../../../routes/[tab]/$types';

	type ArtistsPromise = PageData['artists'];
	type ArtistElement = Awaited<ArtistsPromise> extends Array<infer T> ? (T extends Artist ? T : Artist) : Artist;

	let { artistsPromise, defaultThumbnail }: {
		artistsPromise: ArtistsPromise;
		defaultThumbnail: string;
	} = $props();

	let creatingArtist = $state(false);

	function resolveArtistImage(artist: ArtistElement) {
		return (artist as Artist & { image?: string | null }).image ?? defaultThumbnail;
	}
</script>

<div class="items-left flex flex-row gap-4">
	<Button onclick={() => (creatingArtist = true)}>+</Button>
</div>

<CreateArtistCard bind:open={creatingArtist} onOpenChange={(value) => (creatingArtist = value)} />

{#await artistsPromise}
	<ArtistsSkeleton />
{:then artists}
	<div class="mt-4 flex flex-row flex-wrap gap-4">
		{#each artists as artist (artist.id)}
			<div class="mb-4 w-[256px] rounded border p-4">
				<AspectRatio ratio={1 / 1} class="bg-muted">
					<img
						src={resolveArtistImage(artist)}
						alt={artist.name}
						class="rounded-md object-cover"
					/>
				</AspectRatio>
				<p class="mt-2 block text-sm font-medium">{artist.name}</p>
			</div>
		{/each}
	</div>
{/await}

