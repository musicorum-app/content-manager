-- copy deezer_id to deezer_id_str and cast
UPDATE "Artist"
SET "deezer_id_str" = "deezer_id"::text; 

UPDATE "Album"
SET "deezer_id_str" = "deezer_id"::text;

UPDATE "Track"
SET "deezer_id_str" = "deezer_id"::text;