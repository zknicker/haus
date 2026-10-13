ALTER TABLE "artifacts" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "path_key" text;--> statement-breakpoint
-- Every artifact gets a drive path from its name plus its current revision's filename extension
-- (`report` + `q4.pdf` -> `report.pdf`). Live rows take the first free of `report.pdf`,
-- `report-2.pdf`… in creation order, compared by the same NFC + lowercase key the Server uses.
-- Names and the accepted extensions are ASCII, so `lower` matches JavaScript's `toLowerCase`.
DO $$
DECLARE
    artifact record;
    extension text;
    candidate text;
    attempt integer;
BEGIN
    FOR artifact IN
        SELECT a.id, a.server_id, a.name, a.deleted_at,
            (SELECT r.filename FROM artifact_revisions r
             WHERE r.server_id = a.server_id AND r.artifact_id = a.id
             ORDER BY (r.id = a.current_revision_id) DESC NULLS LAST, r.revision_number DESC
             LIMIT 1) AS filename
        FROM artifacts a
        ORDER BY a.server_id, a.created_at, a.id
    LOOP
        extension := substring(coalesce(artifact.filename, '') FROM '^.+\.([A-Za-z0-9_+-]{1,16})$');
        attempt := 1;
        LOOP
            candidate := normalize(
                artifact.name
                    || CASE WHEN attempt = 1 THEN '' ELSE '-' || attempt END
                    || coalesce('.' || extension, ''),
                NFC
            );
            EXIT WHEN artifact.deleted_at IS NOT NULL OR NOT EXISTS (
                SELECT 1 FROM artifacts other
                WHERE other.server_id = artifact.server_id
                    AND other.deleted_at IS NULL
                    AND other.path_key = lower(candidate)
            );
            attempt := attempt + 1;
        END LOOP;
        UPDATE artifacts SET path = candidate, path_key = lower(candidate) WHERE id = artifact.id;
    END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "artifacts" ALTER COLUMN "path" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "artifacts" ALTER COLUMN "path_key" SET NOT NULL;--> statement-breakpoint
DROP INDEX "artifacts_server_name_key";--> statement-breakpoint
ALTER TABLE "artifacts" DROP COLUMN "name";--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_server_path_key" ON "artifacts" USING btree ("server_id","path_key") WHERE "artifacts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "artifacts_server_path_prefix" ON "artifacts" USING btree ("server_id","path_key" text_pattern_ops) WHERE "artifacts"."deleted_at" is null;
