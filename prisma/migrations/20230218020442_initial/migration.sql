-- CreateEnum
CREATE TYPE "ImageSize" AS ENUM ('EXTRA_SMALL', 'SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ImageResourceSource" AS ENUM ('SPOTIFY', 'DEEZER', 'LASTFM');

-- CreateTable
CREATE TABLE "Image" (
    "hash" CHAR(40) NOT NULL,
    "image_resource_hash" CHAR(40) NOT NULL,
    "size" "ImageSize" NOT NULL DEFAULT 'UNKNOWN',
    "url" VARCHAR(256) NOT NULL,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "ImageResource" (
    "hash" CHAR(40) NOT NULL,
    "explicit" BOOLEAN,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" "ImageResourceSource" NOT NULL,
    "palette_vibrant" CHAR(7),
    "palette_dark_vibrant" CHAR(7),
    "palette_light_vibrant" CHAR(7),
    "palette_muted" CHAR(7),
    "palette_dark_muted" CHAR(7),
    "palette_light_muted" CHAR(7),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageResource_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "Artist" (
    "hash" CHAR(40) NOT NULL,
    "name" TEXT NOT NULL,
    "genres" TEXT[],
    "tags" TEXT[],
    "similar" TEXT[],
    "spotify_id" CHAR(22),
    "deezer_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "preferred_resource" CHAR(40),

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "ArtistImageResourceLink" (
    "artist_hash" CHAR(40) NOT NULL,
    "image_resource_hash" CHAR(40) NOT NULL,

    CONSTRAINT "ArtistImageResourceLink_pkey" PRIMARY KEY ("artist_hash","image_resource_hash")
);

-- CreateTable
CREATE TABLE "Album" (
    "hash" CHAR(40) NOT NULL,
    "name" TEXT NOT NULL,
    "artists" TEXT[],
    "tags" TEXT[],
    "spotify_id" CHAR(22),
    "deezer_id" INTEGER,
    "release_date" VARCHAR(16),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "preferred_resource" CHAR(40),

    CONSTRAINT "Album_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "AlbumImageResourceLink" (
    "album_hash" CHAR(40) NOT NULL,
    "image_resource_hash" CHAR(40) NOT NULL,

    CONSTRAINT "AlbumImageResourceLink_pkey" PRIMARY KEY ("album_hash","image_resource_hash")
);

-- CreateTable
CREATE TABLE "Track" (
    "hash" CHAR(40) NOT NULL,
    "name" TEXT NOT NULL,
    "artists" TEXT[],
    "album" TEXT,
    "spotify_id" CHAR(22),
    "deezer_id" INTEGER,
    "genius_id" INTEGER,
    "tags" TEXT[],
    "duration" INTEGER,
    "preview" VARCHAR(255),
    "explicit" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "preferred_resource" CHAR(40),

    CONSTRAINT "Track_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "TrackImageResourceLink" (
    "track_hash" CHAR(40) NOT NULL,
    "image_resource_hash" CHAR(40) NOT NULL,

    CONSTRAINT "TrackImageResourceLink_pkey" PRIMARY KEY ("track_hash","image_resource_hash")
);

-- CreateTable
CREATE TABLE "TrackFeatures" (
    "spotify_id" CHAR(22) NOT NULL,
    "danceability" DOUBLE PRECISION NOT NULL,
    "energy" DOUBLE PRECISION NOT NULL,
    "loudness" DOUBLE PRECISION NOT NULL,
    "speechiness" DOUBLE PRECISION NOT NULL,
    "acousticness" DOUBLE PRECISION NOT NULL,
    "instrumentalness" DOUBLE PRECISION NOT NULL,
    "liveness" DOUBLE PRECISION NOT NULL,
    "valence" DOUBLE PRECISION NOT NULL,
    "tempo" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TrackFeatures_pkey" PRIMARY KEY ("spotify_id")
);

-- CreateIndex
CREATE INDEX "Image_hash_idx" ON "Image" USING HASH ("hash");

-- CreateIndex
CREATE INDEX "Image_image_resource_hash_idx" ON "Image" USING HASH ("image_resource_hash");

-- CreateIndex
CREATE UNIQUE INDEX "ImageResource_hash_key" ON "ImageResource"("hash");

-- CreateIndex
CREATE INDEX "ImageResource_hash_idx" ON "ImageResource" USING HASH ("hash");

-- CreateIndex
CREATE INDEX "Artist_hash_idx" ON "Artist" USING HASH ("hash");

-- CreateIndex
CREATE INDEX "Album_hash_idx" ON "Album" USING HASH ("hash");

-- CreateIndex
CREATE INDEX "Track_hash_idx" ON "Track" USING HASH ("hash");

-- CreateIndex
CREATE INDEX "TrackFeatures_spotify_id_idx" ON "TrackFeatures" USING HASH ("spotify_id");

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_image_resource_hash_fkey" FOREIGN KEY ("image_resource_hash") REFERENCES "ImageResource"("hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistImageResourceLink" ADD CONSTRAINT "ArtistImageResourceLink_image_resource_hash_fkey" FOREIGN KEY ("image_resource_hash") REFERENCES "ImageResource"("hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistImageResourceLink" ADD CONSTRAINT "ArtistImageResourceLink_artist_hash_fkey" FOREIGN KEY ("artist_hash") REFERENCES "Artist"("hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumImageResourceLink" ADD CONSTRAINT "AlbumImageResourceLink_image_resource_hash_fkey" FOREIGN KEY ("image_resource_hash") REFERENCES "ImageResource"("hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumImageResourceLink" ADD CONSTRAINT "AlbumImageResourceLink_album_hash_fkey" FOREIGN KEY ("album_hash") REFERENCES "Album"("hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackImageResourceLink" ADD CONSTRAINT "TrackImageResourceLink_image_resource_hash_fkey" FOREIGN KEY ("image_resource_hash") REFERENCES "ImageResource"("hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackImageResourceLink" ADD CONSTRAINT "TrackImageResourceLink_track_hash_fkey" FOREIGN KEY ("track_hash") REFERENCES "Track"("hash") ON DELETE RESTRICT ON UPDATE CASCADE;
