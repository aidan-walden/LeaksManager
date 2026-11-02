import type { IpcActions } from '$lib/services/ipc-actions.svelte';
import type { SongImportDraft } from '$lib/ipc';
import { fileToUpload } from '$lib/utils/file-upload';

type StagedSongImport = {
	filesData: SongImportDraft[];
	albumId?: number;
	useEmbeddedArtwork: boolean;
};

type SongImportControllerOptions = {
	onComplete: () => Promise<void> | void;
	ipcActions: Pick<
		IpcActions,
		'cleanupFiles' | 'createSongsWithMetadata' | 'uploadAndExtractMetadata'
	>;
};

export class SongImportController {
	showArtistMappingDialog = $state(false);
	showArtworkChoiceDialog = $state(false);
	unmappedArtists = $state<string[]>([]);
	filesWithArtworkCount = $state(0);

	#stagedImport = $state<StagedSongImport | null>(null);
	#pendingCompletion: PromiseWithResolvers<number> | null = null;
	#onComplete: SongImportControllerOptions['onComplete'];
	#ipcActions: SongImportControllerOptions['ipcActions'];

	constructor(options: SongImportControllerOptions) {
		this.#onComplete = options.onComplete;
		this.#ipcActions = options.ipcActions;
	}

	async handleUpload(files: File[], albumId?: number): Promise<number> {
		const fileUploads = await Promise.all(files.map(fileToUpload));
		const result = await this.#ipcActions.uploadAndExtractMetadata(fileUploads, albumId ?? null);

		const hasArtwork = result.filesWithArtwork > 0;
		const canInheritArtwork =
			albumId != null ||
			result.filesData.some((file) => file.metadata.artwork && file.albumId != null);

		this.#stagedImport = {
			filesData: result.filesData,
			albumId,
			useEmbeddedArtwork: hasArtwork && !canInheritArtwork
		};
		this.unmappedArtists = result.unmappedArtists;

		if (hasArtwork && canInheritArtwork) {
			this.filesWithArtworkCount = result.filesWithArtwork;
			this.showArtworkChoiceDialog = true;
			return this.#waitForPendingCompletion();
		}

		if (this.unmappedArtists.length > 0) {
			this.showArtistMappingDialog = true;
			return this.#waitForPendingCompletion();
		}

		return this.#createSongs({});
	}

	handleArtworkChoice = async (useEmbeddedArtwork: boolean): Promise<number> => {
		if (!this.#stagedImport) return 0;

		this.#stagedImport.useEmbeddedArtwork = useEmbeddedArtwork;

		if (this.unmappedArtists.length > 0) {
			this.showArtistMappingDialog = true;
			return this.#waitForPendingCompletion();
		}

		return this.#createSongs({});
	};

	handleArtistMapping = (artistMapping: Record<string, number | 'CREATE_NEW'>): Promise<number> =>
		this.#createSongs(artistMapping);

	handleArtistMappingCancel = async (): Promise<number> => {
		if (!this.#stagedImport) return 0;

		try {
			const filesToKeep = this.#stagedImport.filesData.filter((file) => !file.hasUnmappedArtists);
			const filesToDelete = this.#stagedImport.filesData.filter((file) => file.hasUnmappedArtists);

			if (filesToDelete.length > 0) {
				await this.#ipcActions.cleanupFiles(filesToDelete.map((file) => file.filepath));
			}

			if (filesToKeep.length > 0) {
				this.#stagedImport.filesData = filesToKeep;
				return this.#createSongs({});
			}

			this.#reset();
			this.#resolvePendingCompletion(0);
			void this.#onComplete();
			return 0;
		} catch (error) {
			this.#rejectPendingCompletion(error);
			throw error;
		}
	};

	#createSongs = async (artistMapping: Record<string, number | 'CREATE_NEW'>): Promise<number> => {
		if (!this.#stagedImport) return 0;

		try {
			const createdSongs = await this.#ipcActions.createSongsWithMetadata({
				filesData: this.#stagedImport.filesData,
				artistMapping,
				albumId: this.#stagedImport.albumId,
				useEmbeddedArtwork: this.#stagedImport.useEmbeddedArtwork
			});

			this.#reset();
			this.#resolvePendingCompletion(createdSongs.length);
			void this.#onComplete();
			return createdSongs.length;
		} catch (error) {
			// A hard failure of the create call means no songs were created but the files
			// were already saved to disk in phase 1. Clean them up so they don't orphan.
			const staged = this.#stagedImport;
			if (staged) {
				try {
					await this.#ipcActions.cleanupFiles(staged.filesData.map((file) => file.filepath));
				} catch {
					// best-effort — surface the original error below
				}
			}
			this.#rejectPendingCompletion(error);
			throw error;
		}
	};

	#waitForPendingCompletion(): Promise<number> {
		this.#pendingCompletion ??= Promise.withResolvers<number>();
		return this.#pendingCompletion.promise;
	}

	#resolvePendingCompletion(createdCount: number) {
		this.#pendingCompletion?.resolve(createdCount);
		this.#pendingCompletion = null;
	}

	#rejectPendingCompletion(error: unknown) {
		this.#pendingCompletion?.reject(error);
		this.#pendingCompletion = null;
	}

	#reset() {
		this.#stagedImport = null;
		this.unmappedArtists = [];
		this.filesWithArtworkCount = 0;
		this.showArtistMappingDialog = false;
		this.showArtworkChoiceDialog = false;
	}
}
