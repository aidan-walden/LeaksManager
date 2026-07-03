-- Artists table
CREATE TABLE IF NOT EXISTS "artists" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "name" TEXT NOT NULL,
    "career_start_year" INTEGER,
    "career_end_year" INTEGER,
    "additional_metadata" TEXT,
    "created_at" INTEGER,
    "updated_at" INTEGER,
    "image" TEXT,
    "synced" INTEGER DEFAULT 0
);

-- Albums table
CREATE TABLE IF NOT EXISTS "albums" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "name" TEXT NOT NULL,
    "artwork_path" TEXT,
    "genre" TEXT,
    "year" INTEGER,
    "additional_metadata" TEXT,
    "created_at" INTEGER,
    "updated_at" INTEGER,
    "synced" INTEGER DEFAULT 0
);

-- Songs table
CREATE TABLE IF NOT EXISTS "songs" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "name" TEXT NOT NULL,
    "album_id" INTEGER,
    "artwork_path" TEXT,
    "genre" TEXT,
    "year" INTEGER,
    "track_number" INTEGER,
    "duration" REAL,
    "filepath" TEXT NOT NULL,
    "file_type" TEXT,
    "synced_to_itunes" INTEGER DEFAULT 0 NOT NULL,
    "apple_music_id" TEXT,
    "additional_metadata" TEXT,
    "created_at" INTEGER,
    "updated_at" INTEGER,
    "synced" INTEGER DEFAULT 0,
    FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE SET NULL
);

-- Producers table
CREATE TABLE IF NOT EXISTS "producers" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "name" TEXT NOT NULL,
    "additional_metadata" TEXT,
    "created_at" INTEGER,
    "updated_at" INTEGER
);

-- Producer aliases table
CREATE TABLE IF NOT EXISTS "producer_aliases" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "producer_id" INTEGER NOT NULL,
    "alias" TEXT NOT NULL UNIQUE,
    "created_at" INTEGER,
    FOREIGN KEY ("producer_id") REFERENCES "producers"("id") ON DELETE CASCADE
);

-- Settings table
CREATE TABLE IF NOT EXISTS "settings" (
    "id" INTEGER PRIMARY KEY DEFAULT 1 NOT NULL,
    "clear_track_number_on_upload" INTEGER DEFAULT 0 NOT NULL,
    "import_to_apple_music" INTEGER DEFAULT 0 NOT NULL,
    "automatically_make_singles" INTEGER DEFAULT 0 NOT NULL,
    "updated_at" INTEGER
);

-- Junction tables
CREATE TABLE IF NOT EXISTS "album_artists" (
    "album_id" INTEGER NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "order" INTEGER DEFAULT 0,
    "created_at" INTEGER,
    PRIMARY KEY("album_id", "artist_id"),
    FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE,
    FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "song_artists" (
    "song_id" INTEGER NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "order" INTEGER DEFAULT 0,
    "created_at" INTEGER,
    PRIMARY KEY("song_id", "artist_id"),
    FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE,
    FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "song_producers" (
    "song_id" INTEGER NOT NULL,
    "producer_id" INTEGER NOT NULL,
    "order" INTEGER DEFAULT 0,
    "created_at" INTEGER,
    PRIMARY KEY("song_id", "producer_id"),
    FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE,
    FOREIGN KEY ("producer_id") REFERENCES "producers"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "producer_alias_artists" (
    "alias_id" INTEGER NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "created_at" INTEGER,
    PRIMARY KEY("alias_id", "artist_id"),
    FOREIGN KEY ("alias_id") REFERENCES "producer_aliases"("id") ON DELETE CASCADE,
    FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE
);
