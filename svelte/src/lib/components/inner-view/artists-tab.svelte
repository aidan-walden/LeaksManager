<script lang="ts">
	import ArtistsLike from './artists-like.svelte';
	import CreateArtistCard from '$lib/components/ui/create-artist-card.svelte';
	import ArtistsSkeleton from '$lib/components/ui/artists-skeleton.svelte';
	import type { Artist } from '$lib/wails';
	import type { PageData } from '../../../routes/[tab]/$types';

	type ArtistsPromise = PageData['artists'];
	type ArtistElement = Awaited<ArtistsPromise> extends Array<infer T> ? (T extends Artist ? T : Artist) : Artist;

	let { artistsPromise, defaultThumbnail }: {
		artistsPromise: ArtistsPromise;
		defaultThumbnail: string;
	} = $props();

	function resolveArtistImage(artist: ArtistElement) {
		return (artist as Artist & { image?: string | null }).image ?? defaultThumbnail;
	}
</script>

<ArtistsLike
	dataPromise={artistsPromise}
	entityType="artist"
	showImages={true}
	defaultThumbnail={defaultThumbnail}
	createCardComponent={CreateArtistCard}
	skeletonComponent={ArtistsSkeleton}
	resolveImage={resolveArtistImage}
/>

