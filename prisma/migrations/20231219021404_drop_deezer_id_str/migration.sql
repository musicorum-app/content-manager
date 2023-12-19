/*
  Warnings:

  - You are about to drop the column `deezer_id_str` on the `Album` table. All the data in the column will be lost.
  - You are about to drop the column `deezer_id_str` on the `Artist` table. All the data in the column will be lost.
  - You are about to drop the column `deezer_id_str` on the `Track` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Album" DROP COLUMN "deezer_id_str";

-- AlterTable
ALTER TABLE "Artist" DROP COLUMN "deezer_id_str";

-- AlterTable
ALTER TABLE "Track" DROP COLUMN "deezer_id_str";
