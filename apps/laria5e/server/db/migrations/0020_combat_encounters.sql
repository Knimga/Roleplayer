CREATE TABLE "combats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"context" jsonb NOT NULL,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "combat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"combat_id" uuid NOT NULL,
	"sender" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"author_username" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "combats" ADD CONSTRAINT "combats_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combat_messages" ADD CONSTRAINT "combat_messages_combat_id_combats_id_fk" FOREIGN KEY ("combat_id") REFERENCES "combats"("id") ON DELETE no action ON UPDATE no action;
