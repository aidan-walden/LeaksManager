<script lang="ts">
	import ArtistsLike from './artists-like.svelte';
	import CreateArtistCard from '$lib/components/ui/create-artist-card.svelte';
	import ArtistsSkeleton from '$lib/components/ui/artists-skeleton.svelte';
	import { invalidateAll } from '$app/navigation';
	import { editableArtistSchema, type EditableArtist } from '@/schema';
	import type { Artist } from '$lib/wails';
	import type { PageData } from '../../../routes/[tab]/$types';

	type ArtistsPromise = PageData['artists'];
	type ArtistElement = Awaited<ArtistsPromise> extends Array<infer T> ? (T extends Artist ? T : Artist) : Artist;

	let creatingArtist = $state(false);
	let currentArtist = $state<EditableArtist | null>(null);

	let { artistsPromise, defaultThumbnail }: {
		artistsPromise: ArtistsPromise;
		defaultThumbnail: string;
	} = $props();

	async function onDelete(id: number) {
		// DeleteArtist function not yet implemented in wails
		console.warn('DeleteArtist not yet implemented');
		// await DeleteArtist(id);
		// await invalidateAll();
	}

	function convertToEditableArtist(artist: Artist): EditableArtist {
		// zod parse will validate and extract only known fields
		return editableArtistSchema.parse(artist);
	}

	function onClickEdit(artist: Artist) {
		currentArtist = convertToEditableArtist(artist);
		creatingArtist = true;
	}

	function resolveArtistImage(artist: ArtistElement): string {
		if ('image' in artist && typeof artist.image === 'string') {
			return artist.image || defaultThumbnail;
		}
		return defaultThumbnail;
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
	onEdit={onClickEdit}
	onDelete={onDelete}
/>

