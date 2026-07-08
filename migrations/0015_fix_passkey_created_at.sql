-- Better Auth hands `createdAt` to the Drizzle adapter as a JS Date. The
-- passkey table declared the column as `date` (NUMERIC affinity), so Drizzle
-- bound the raw Date object and D1 rejected it:
--   D1_TYPE_ERROR: Type 'object' not supported for value 'Wed Jul 08 2026 ...'
-- Every other Better Auth table stores dates as integer timestamps; align the
-- passkey table so Drizzle serializes the Date to a unix integer before binding.
-- Registration never succeeded, so the table is empty and a rebuild is safe.

ALTER TABLE "passkey" RENAME TO "passkey_old";
--> statement-breakpoint
CREATE TABLE "passkey" (
    "id" text NOT NULL PRIMARY KEY,
    "name" text,
    "publicKey" text NOT NULL,
    "userId" text NOT NULL,
    "credentialID" text NOT NULL,
    "counter" integer NOT NULL,
    "deviceType" text NOT NULL,
    "backedUp" integer NOT NULL,
    "transports" text,
    "createdAt" integer,
    "aaguid" text,
    FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO "passkey" (
    "id", "name", "publicKey", "userId", "credentialID", "counter",
    "deviceType", "backedUp", "transports", "createdAt", "aaguid"
)
SELECT
    "id", "name", "publicKey", "userId", "credentialID", "counter",
    "deviceType", "backedUp", "transports", "createdAt", "aaguid"
FROM "passkey_old";
--> statement-breakpoint
DROP TABLE "passkey_old";
