CREATE TABLE "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_notifications_enabled" boolean DEFAULT true NOT NULL
);
