import type Database from 'better-sqlite3';
import type {
	Song,
	SongReadable,
	Artist,
	Producer,
	Album,
	CreateSongInput,
	UpdateSongInput
} from './models';
import { rowToSong, rowToArtist, rowToProducer, rowToAlbum, now } from './rows';
import { resolveOrCreateAlbum } from './albums';
import { staticFilePath } from '../paths';
import { rmSync } from 'node:fs';

// Port of backend/songs.go — create + read paths plus update/delete (US2).

const SONG_COLS =
	'id, name, album_id, artwork_path, genre, year, track_number, duration, filepath, file_type, created_at, updated_at, synced, apple_music_id';

export function createSong(db: Database.Database, input: CreateSongInput): Song {
	const ts = now();
	return db.transaction((tx) => {
		const info = tx
			.prepare(
				`INSERT INTO songs (name, filepath, album_id, artwork_path, genre, year, track_number, duration, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				input.name,
				input.filepath,
				input.albumId ?? null,
				input.artworkPath ?? null,
				input.genre ?? null,
				input.year ?? null,
				input.trackNumber ?? null,
				input.duration ?? null,
				ts,
				ts
			);
		const songId = Number(info.lastInsertRowid);

		const linkArtist = tx.prepare(
			`INSERT INTO song_artists (song_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`
		);
		input.artistIds.forEach((artistId, i) => linkArtist.run(songId, artistId, i, ts));

		const linkProducer = tx.prepare(
			`INSERT INTO song_producers (song_id, producer_id, "order", created_at) VALUES (?, ?, ?, ?)`
		);
		input.producerIds.forEach((producerId, i) => linkProducer.run(songId, producerId, i, ts));

		return {
			id: songId,
			name: input.name,
			albumId: input.albumId ?? null,
			artworkPath: input.artworkPath ?? null,
			genre: input.genre ?? null,
			year: input.year ?? null,
			trackNumber: input.trackNumber ?? null,
			duration: input.duration ?? null,
			filepath: input.filepath,
			fileType: null,
			createdAt: ts,
			updatedAt: ts,
			synced: false
		};
	})(db);
}

export function getSongById(db: Database.Database, songId: number): Song | null {
	const row = db.prepare(`SELECT ${SONG_COLS} FROM songs WHERE id = ?`).get(songId) as
		| Record<string, unknown>
		| undefined;
	return row ? rowToSong(row) : null;
}

export function getSongReadable(db: Database.Database, songId: number): SongReadable | null {
	const song = getSongById(db, songId);
	return song ? buildSongReadable(db, song) : null;
}

export function updateSong(db: Database.Database, input: UpdateSongInput): SongReadable | null {
	const ts = now();

	let albumId = input.albumId ?? null;
	if (input.albumName != null) {
		const { album } = resolveOrCreateAlbum(db, input.albumName, input.artistIds, {
			isSingle: input.isSingle,
			inheritArtworkFromSongId: input.id
		});
		albumId = album ? album.id : null;
	}

	db.transaction((tx) => {
		tx.prepare(
			`UPDATE songs SET name = COALESCE(?, name), album_id = ?, track_number = ?, updated_at = ? WHERE id = ?`
		).run(input.name ?? null, albumId, input.trackNumber ?? null, ts, input.id);

		if (input.artistIds != null) {
			tx.prepare(`DELETE FROM song_artists WHERE song_id = ?`).run(input.id);
			const linkArtist = tx.prepare(
				`INSERT INTO song_artists (song_id, artist_id, "order", created_at) VALUES (?, ?, ?, ?)`
			);
			input.artistIds.forEach((artistId, i) => linkArtist.run(input.id, artistId, i, ts));
		}

		if (input.producerIds != null) {
			tx.prepare(`DELETE FROM song_producers WHERE song_id = ?`).run(input.id);
			const linkProducer = tx.prepare(
				`INSERT INTO song_producers (song_id, producer_id, "order", created_at) VALUES (?, ?, ?, ?)`
			);
			input.producerIds.forEach((producerId, i) => linkProducer.run(input.id, producerId, i, ts));
		}
	})(db);

	return getSongReadable(db, input.id);
}

export function deleteSong(db: Database.Database, staticPath: string, songId: number): void {
	let songFilepath = '';
	db.transaction((tx) => {
		const row = tx.prepare(`SELECT filepath FROM songs WHERE id = ?`).get(songId) as
			| { filepath: string }
			| undefined;
		if (!row) throw new Error(`song ${songId} not found`);
		songFilepath = row.filepath;
		tx.prepare(`DELETE FROM songs WHERE id = ?`).run(songId);
	})(db);

	// Delete file from disk (best-effort, mirror Go)
	if (songFilepath !== '') {
		try {
			rmSync(staticFilePath(staticPath, songFilepath));
		} catch {
			// ignore — Go swallows the path/remove error
		}
	}
}

export function getSongsReadable(
	db: Database.Database,
	limit: number,
	offset: number
): SongReadable[] {
	const rows = db
		.prepare(`SELECT ${SONG_COLS} FROM songs ORDER BY created_at DESC LIMIT ? OFFSET ?`)
		.all(limit, offset) as Record<string, unknown>[];
	return rows.map((r) => buildSongReadable(db, rowToSong(r)));
}

export function getSongsCount(db: Database.Database): number {
	return (db.prepare(`SELECT COUNT(*) AS c FROM songs`).get() as { c: number }).c;
}

export function buildSongReadable(db: Database.Database, song: Song): SongReadable {
	const artists = getArtistsForSong(db, song.id);
	const producers = getProducersForSong(db, song.id);
	const album = song.albumId != null ? getAlbumById(db, song.albumId) : null;
	return {
		...song,
		artist: artists.map((a) => a.name).join(', '),
		artists,
		producers,
		album
	};
}

export function getArtistsForSong(db: Database.Database, songId: number): Artist[] {
	const rows = db
		.prepare(
			`SELECT ar.id, ar.name, ar.image, ar.career_start_year, ar.career_end_year, ar.created_at, ar.updated_at, ar.synced
			 FROM artists ar
			 JOIN song_artists sa ON ar.id = sa.artist_id
			 WHERE sa.song_id = ?
			 ORDER BY sa."order"`
		)
		.all(songId) as Record<string, unknown>[];
	return rows.map(rowToArtist);
}

export function getProducersForSong(db: Database.Database, songId: number): Producer[] {
	const rows = db
		.prepare(
			`SELECT p.id, p.name, p.created_at, p.updated_at
			 FROM producers p
			 JOIN song_producers sp ON p.id = sp.producer_id
			 WHERE sp.song_id = ?
			 ORDER BY sp."order"`
		)
		.all(songId) as Record<string, unknown>[];
	return rows.map(rowToProducer);
}

export function getAlbumById(db: Database.Database, albumId: number): Album | null {
	const row = db
		.prepare(
			`SELECT id, name, artwork_path, genre, year, is_single, created_at, updated_at, synced FROM albums WHERE id = ?`
		)
		.get(albumId) as Record<string, unknown> | undefined;
	return row ? rowToAlbum(row) : null;
}
