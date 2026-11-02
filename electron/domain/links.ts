import type Database from 'better-sqlite3';

// Ordered many-to-many junctions. Table and column names come from this constant map,
// never from input, so interpolating them into SQL is safe.
const ORDERED_LINKS = {
	song_artists: ['song_id', 'artist_id'],
	song_producers: ['song_id', 'producer_id'],
	album_artists: ['album_id', 'artist_id']
} as const;

type OrderedLinkTable = keyof typeof ORDERED_LINKS;

export function linkOrdered(
	tx: Database.Database,
	table: OrderedLinkTable,
	ownerId: number,
	targetIds: number[],
	ts: number
): void {
	const [ownerCol, targetCol] = ORDERED_LINKS[table];
	const link = tx.prepare(
		`INSERT INTO ${table} (${ownerCol}, ${targetCol}, "order", created_at) VALUES (?, ?, ?, ?)`
	);
	targetIds.forEach((targetId, i) => link.run(ownerId, targetId, i, ts));
}

// Delete-and-reinsert is load-bearing: the sync triggers from migration 000002 fire on
// these writes and reset `synced`.
export function replaceOrderedLinks(
	tx: Database.Database,
	table: OrderedLinkTable,
	ownerId: number,
	targetIds: number[],
	ts: number
): void {
	tx.prepare(`DELETE FROM ${table} WHERE ${ORDERED_LINKS[table][0]} = ?`).run(ownerId);
	linkOrdered(tx, table, ownerId, targetIds, ts);
}
