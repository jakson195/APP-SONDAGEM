-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SPT" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prof" REAL NOT NULL,
    "g1" INTEGER NOT NULL,
    "g2" INTEGER NOT NULL,
    "g3" INTEGER NOT NULL,
    "solo" TEXT NOT NULL,
    "furoId" INTEGER NOT NULL,
    CONSTRAINT "SPT_furoId_fkey" FOREIGN KEY ("furoId") REFERENCES "Furo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SPT" ("furoId", "g1", "g2", "g3", "id", "prof", "solo") SELECT "furoId", "g1", "g2", "g3", "id", "prof", "solo" FROM "SPT";
DROP TABLE "SPT";
ALTER TABLE "new_SPT" RENAME TO "SPT";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
