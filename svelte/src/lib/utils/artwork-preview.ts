import { toAssetUrl } from '$lib/utils';

export async function loadArtworkPreviewBlob(artworkPath: string | null | undefined): Promise<Blob | null> {
	const assetUrl = toAssetUrl(artworkPath);
	if (!assetUrl) {
		return null;
	}

	try {
		const response = await fetch(assetUrl);
		if (!response.ok) {
			return null;
		}

		return await response.blob();
	} catch {
		return null;
	}
}
