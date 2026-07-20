CREATE TABLE "api_keys" (
    "id" text NOT NULL PRIMARY KEY,
    "name" text NOT NULL,
    "key_prefix" text NOT NULL,
    "key_hash" text NOT NULL UNIQUE,
    "user_id" text NOT NULL,
    "created_at" integer NOT NULL,
    "last_used_at" integer,
    FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" ("user_id");
