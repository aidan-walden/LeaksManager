import type { WailsActions } from '$lib/services/wails-actions';
import type { FileUpload, SongImportDraft } from '$lib/wails';

type StagedSongImport = {
	filesData: SongImportDraft[];
	albumId?: number;
	useEmbeddedArtwork: boolean;
};

type SongImportControllerOptions = {
	onComplete: () => Promise<void>;
	wailsActions: Pick<
		WailsActions,
		'cleanupFiles' | 'createSongsWithMetadata' | 'uploadAndExtractMetadata'
	>;
};

export class SongImportController {
	showArtistMappingDialog = $state(false);
	showArtworkChoiceDialog = $state(false);
	unmappedArtists = $state<string[]>([]);
	filesWithArtworkCount = $state(0);

	#stagedImport = $state<StagedSongImport | null>(null);
	#onComplete: SongImportControllerOptions['onComplete'];
	#wailsActions: SongImportControllerOptions['wailsActions'];

	constructor(options: SongImportControllerOptions) {
		this.#onComplete = options.onComplete;
		this.#wailsActions = options.wailsActions;
	}

	async handleUpload(files: File[], albumId?: number) {
		const fileUploads = await Promise.all(files.map(this.#fileToUpload));
		const result = await this.#wailsActions.uploadAndExtractMetadata({ files: fileUploads, albumId });

		this.#stagedImport = {
			filesData: result.filesData,
			albumId,
			useEmbeddedArtwork:
				result.filesWithArtwork > 0 && !this.#canInheritArtwork(result.filesData, albumId)
		};
		this.unmappedArtists = result.unmappedArtists ?? [];

		if (result.filesWithArtwork > 0 && this.#canInheritArtwork(result.filesData, albumId)) {
			this.filesWithArtworkCount = result.filesWithArtwork;
			this.showArtworkChoiceDialog = true;
			return;
		}

		if (this.unmappedArtists.length > 0) {
			this.showArtistMappingDialog = true;
			return;
		}

		await this.#createSongs({}, this.#stagedImport.useEmbeddedArtwork);
	}

	async handleArtworkChoice(useEmbeddedArtwork: boolean) {
		if (!this.#stagedImport) return;

		this.#stagedImport.useEmbeddedArtwork = useEmbeddedArtwork;

		if (this.unmappedArtists.length > 0) {
			this.showArtistMappingDialog = true;
			return;
		}

		await this.#createSongs({}, useEmbeddedArtwork);
	}

	async handleArtistMapping(artistMapping: Record<string, number | 'CREATE_NEW'>) {
		if (!this.#stagedImport) return;

		await this.#createSongs(artistMapping, this.#stagedImport.useEmbeddedArtwork);
	}

	async handleArtistMappingCancel() {
		if (!this.#stagedImport) return;

		const filesToKeep = this.#stagedImport.filesData.filter((file) => !file.hasUnmappedArtists);
		const filesToDelete = this.#stagedImport.filesData.filter((file) => file.hasUnmappedArtists);

		if (filesToDelete.length > 0) {
			await this.#wailsActions.cleanupFiles(filesToDelete.map((file) => file.filepath));
		}

		if (filesToKeep.length > 0) {
			this.#stagedImport.filesData = filesToKeep;
			await this.#createSongs({}, this.#stagedImport.useEmbeddedArtwork);
			return;
		}

		this.#reset();
		await this.#onComplete();
	}

	#canInheritArtwork(filesData: SongImportDraft[], albumId?: number) {
		if (albumId != null) {
			return true;
		}

		return filesData.some((file) => file.metadata.artwork && file.albumId != null);
	}

	#fileToUpload = async (file: File): Promise<FileUpload> => {
		const base64 = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				if (typeof reader.result !== 'string') {
					reject(new Error('failed to read file as data URL'));
					return;
				}
				const base64Data = reader.result.split(',', 2)[1];
				if (!base64Data) {
					reject(new Error('failed to parse base64 data from file'));
					return;
				}
				resolve(base64Data);
			};
			reader.onerror = () => reject(reader.error ?? new Error('failed to read file'));
			reader.readAsDataURL(file);
		});

		return {
			filename: file.name,
			base64Data: base64
		};
	};

	#createSongs = async (
		artistMapping: Record<string, number | 'CREATE_NEW'>,
		useEmbeddedArtwork: boolean
	) => {
		if (!this.#stagedImport) return;

		await this.#wailsActions.createSongsWithMetadata({
			filesData: this.#stagedImport.filesData,
			artistMapping,
			albumId: this.#stagedImport.albumId,
			useEmbeddedArtwork
		});

		this.#reset();
		await this.#onComplete();
	};

	#reset() {
		this.#stagedImport = null;
		this.unmappedArtists = [];
		this.filesWithArtworkCount = 0;
		this.showArtistMappingDialog = false;
		this.showArtworkChoiceDialog = false;
	}
}
