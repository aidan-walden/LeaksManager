DROP TRIGGER IF EXISTS song_metadata_update_cascade;

CREATE TRIGGER song_metadata_update_cascade
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
