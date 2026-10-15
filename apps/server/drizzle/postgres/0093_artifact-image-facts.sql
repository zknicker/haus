ALTER TABLE "artifact_revisions" ADD COLUMN "image_dpi" integer;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD COLUMN "image_height" integer;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD COLUMN "image_width" integer;--> statement-breakpoint
CREATE COLLATION IF NOT EXISTS "artifact_natural" (provider = icu, locale = 'und-u-kn-true');