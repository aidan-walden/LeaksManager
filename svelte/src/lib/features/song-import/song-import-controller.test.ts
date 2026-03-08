import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SongImportController } from './song-import-controller.svelte';

const fileReaderState = vi.hoisted(() => ({
	result: 'data:audio/mpeg;base64,ZmFrZQ=='
}));

class MockFileReader {
	result: string | ArrayBuffer | null = null;
	error: DOMException | null = null;
	onload: null | (() => void) = null;
	onerror: null | (() => void) = null;

	readAsDataURL() {
		this.result = fileReaderState.result;
		this.onload?.();
	}
}

describe('SongImportController', () => {
	const wailsActions = {
		uploadAndExtractMetadata: vi.fn(),
		createSongsWithMetadata: vi.fn(),
		cleanupFiles: vi.fn()
	};
	const onComplete = vi.fn().mockResolvedValue(undefined);
	const originalFileReader = globalThis.FileReader;

	beforeEach(() => {
		vi.clearAllMocks();
		globalThis.FileReader = MockFileReader as unknown as typeof FileReader;
		wailsActions.createSongsWithMetadata.mockResolvedValue([{ id: 1 }]);
	});

	it('creates songs immediately when no follow-up dialogs are needed', async () => {
		wailsActions.uploadAndExtractMetadata.mockResolvedValue({
			filesData: [
				{
					originalFilename: 'track.mp3',
					filepath: 'uploads/songs/track.mp3',
					metadata: { artwork: null },
					hasUnmappedArtists: false
				}
			],
			unmappedArtists: [],
			filesWithArtwork: 0
		});
		const controller = new SongImportController({ onComplete, wailsActions });

		const createdCount = await controller.handleUpload([
			new File(['track'], 'track.mp3', { type: 'audio/mpeg' })
		]);

		expect(wailsActions.createSongsWithMetadata).toHaveBeenCalledWith({
			filesData: [
				expect.objectContaining({
					filepath: 'uploads/songs/track.mp3'
				})
			],
			artistMapping: {},
			albumId: undefined,
			useEmbeddedArtwork: false
		});
		expect(controller.showArtworkChoiceDialog).toBe(false);
		expect(controller.showArtistMappingDialog).toBe(false);
		expect(createdCount).toBe(1);
		expect(onComplete).toHaveBeenCalled();
	});

	it('stages artwork choice before creating songs when artwork can be inherited', async () => {
		wailsActions.uploadAndExtractMetadata.mockResolvedValue({
			filesData: [
				{
					originalFilename: 'track.mp3',
					filepath: 'uploads/songs/track.mp3',
					albumId: 4,
					metadata: { artwork: { data: 'x', mimeType: 'image/jpeg' } },
					hasUnmappedArtists: false
				}
			],
			unmappedArtists: [],
			filesWithArtwork: 1
		});
		const controller = new SongImportController({ onComplete, wailsActions });

		const uploadPromise = controller.handleUpload([
			new File(['track'], 'track.mp3', { type: 'audio/mpeg' })
		]);
		await vi.waitFor(() => {
			expect(controller.showArtworkChoiceDialog).toBe(true);
		});

		expect(wailsActions.createSongsWithMetadata).not.toHaveBeenCalled();

		await controller.handleArtworkChoice(true);
		expect(await uploadPromise).toBe(1);

		expect(wailsActions.createSongsWithMetadata).toHaveBeenCalledWith(
			expect.objectContaining({
				useEmbeddedArtwork: true
			})
		);
	});

	it('cleans up cancelled unmapped files and imports the rest', async () => {
		wailsActions.uploadAndExtractMetadata.mockResolvedValue({
			filesData: [
				{
					originalFilename: 'keep.mp3',
					filepath: 'uploads/songs/keep.mp3',
					metadata: { artwork: null },
					hasUnmappedArtists: false
				},
				{
					originalFilename: 'drop.mp3',
					filepath: 'uploads/songs/drop.mp3',
					metadata: { artwork: null },
					hasUnmappedArtists: true
				}
			],
			unmappedArtists: ['Guest Artist'],
			filesWithArtwork: 0
		});
		const controller = new SongImportController({ onComplete, wailsActions });

		const uploadPromise = controller.handleUpload([
			new File(['track'], 'track.mp3', { type: 'audio/mpeg' })
		]);
		await vi.waitFor(() => {
			expect(controller.showArtistMappingDialog).toBe(true);
		});

		expect(await controller.handleArtistMappingCancel()).toBe(1);
		expect(await uploadPromise).toBe(1);

		expect(wailsActions.cleanupFiles).toHaveBeenCalledWith(['uploads/songs/drop.mp3']);
		expect(wailsActions.createSongsWithMetadata).toHaveBeenCalledWith(
			expect.objectContaining({
				filesData: [expect.objectContaining({ filepath: 'uploads/songs/keep.mp3' })]
			})
		);
	});

	it('resets staged state when every unmapped file is cancelled', async () => {
		wailsActions.uploadAndExtractMetadata.mockResolvedValue({
			filesData: [
				{
					originalFilename: 'drop.mp3',
					filepath: 'uploads/songs/drop.mp3',
					metadata: { artwork: null },
					hasUnmappedArtists: true
				}
			],
			unmappedArtists: ['Guest Artist'],
			filesWithArtwork: 0
		});
		const controller = new SongImportController({ onComplete, wailsActions });

		const uploadPromise = controller.handleUpload([
			new File(['track'], 'track.mp3', { type: 'audio/mpeg' })
		]);
		await vi.waitFor(() => {
			expect(controller.showArtistMappingDialog).toBe(true);
		});
		expect(await controller.handleArtistMappingCancel()).toBe(0);
		expect(await uploadPromise).toBe(0);

		expect(wailsActions.cleanupFiles).toHaveBeenCalledWith(['uploads/songs/drop.mp3']);
		expect(wailsActions.createSongsWithMetadata).not.toHaveBeenCalled();
		expect(controller.showArtistMappingDialog).toBe(false);
		expect(onComplete).toHaveBeenCalled();
	});

	afterEach(() => {
		globalThis.FileReader = originalFileReader;
	});
});
