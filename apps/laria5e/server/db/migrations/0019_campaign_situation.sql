ALTER TABLE "stories" ADD COLUMN "situation" jsonb;--> statement-breakpoint
ALTER TABLE "stories" DROP COLUMN "beats_tracker";--> statement-breakpoint
ALTER TABLE "stories" DROP COLUMN "villain_plan_tracker";
