CREATE TABLE IF NOT EXISTS "passkey" (
    "id" text NOT NULL PRIMARY KEY,
    "name" text,
    "publicKey" text NOT NULL,
    "userId" text NOT NULL,
    "credentialID" text NOT NULL,
    "counter" integer NOT NULL,
    "deviceType" text NOT NULL,
    "backedUp" integer NOT NULL,
    "transports" text,
    "createdAt" date,
    "aaguid" text,
    FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
);
