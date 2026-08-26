ALTER TABLE "conversations" ADD COLUMN "is_main_story" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "character_names" jsonb;