-- When album metadata changes (name, year, genre, artwork), mark album and songs as unsynced
CREATE TRIGGER IF NOT EXISTS album_metadata_update_cascade
AFTER UPDATE OF name, year, genre, artwork_path ON albums
FOR EACH ROW
WHEN OLD.name IS NOT NEW.name
  OR OLD.year IS NOT NEW.year
  OR OLD.genre IS NOT NEW.genre
  OR OLD.artwork_path IS NOT NEW.artwork_path
BEGIN
    UPDATE albums SET synced = 0 WHERE id = NEW.id;
    UPDATE songs SET synced = 0 WHERE album_id = NEW.id;
END;

-- When album artists change, mark album and its songs as unsynced
CREATE TRIGGER IF NOT EXISTS album_artists_insert_cascade
AFTER INSERT ON album_artists
FOR EACH ROW
BEGIN
    UPDATE albums SET synced = 0 WHERE id = NEW.album_id;
    UPDATE songs SET synced = 0 WHERE album_id = NEW.album_id;
END;

CREATE TRIGGER IF NOT EXISTS album_artists_delete_cascade
AFTER DELETE ON album_artists
FOR EACH ROW
BEGIN
    UPDATE albums SET synced = 0 WHERE id = OLD.album_id;
    UPDATE songs SET synced = 0 WHERE album_id = OLD.album_id;
END;

-- When song artists change, mark song as unsynced
CREATE TRIGGER IF NOT EXISTS song_artists_insert_cascade
AFTER INSERT ON song_artists
FOR EACH ROW
BEGIN
    UPDATE songs SET synced = 0 WHERE id = NEW.song_id;
END;

CREATE TRIGGER IF NOT EXISTS song_artists_delete_cascade
AFTER DELETE ON song_artists
FOR EACH ROW
BEGIN
    UPDATE songs SET synced = 0 WHERE id = OLD.song_id;
END;

-- When artist name changes, mark artist and all related songs/albums as unsynced
CREATE TRIGGER IF NOT EXISTS artist_name_update_cascade
AFTER UPDATE OF name ON artists
FOR EACH ROW
WHEN OLD.name IS NOT NEW.name
BEGIN
    UPDATE artists SET synced = 0 WHERE id = NEW.id;
    UPDATE songs SET synced = 0 WHERE id IN (
        SELECT song_id FROM song_artists WHERE artist_id = NEW.id
    );
    UPDATE albums SET synced = 0 WHERE id IN (
        SELECT album_id FROM album_artists WHERE artist_id = NEW.id
    );
END;

-- When song direct metadata changes (name, genre, year, track_number, artwork)
CREATE TRIGGER IF NOT EXISTS song_metadata_update_cascade
AFTER UPDATE OF name, genre, year, track_number, artwork_path ON songs
FOR EACH ROW
WHEN OLD.name IS NOT NEW.name
  OR OLD.genre IS NOT NEW.genre
  OR OLD.year IS NOT NEW.year
  OR OLD.track_number IS NOT NEW.track_number
  OR OLD.artwork_path IS NOT NEW.artwork_path
BEGIN
    UPDATE songs SET synced = 0 WHERE id = NEW.id;
END;
