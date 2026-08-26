ALTER TABLE "messages" ADD COLUMN "author_username" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "edited" boolean DEFAULT false NOT NULL;