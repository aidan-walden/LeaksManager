ALTER TABLE albums ADD COLUMN is_single INTEGER NOT NULL DEFAULT 0;
UPDATE albums SET is_single = 1 WHERE name LIKE '% - Single';
