CREATE TABLE "cloud_agent_pull_requests" (
	"additions" integer NOT NULL,
	"changed_files" integer NOT NULL,
	"checks" text DEFAULT 'unknown' NOT NULL,
	"deletions" integer NOT NULL,
	"head_sha" text,
	"number" integer NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"refresh_requested_at" timestamp with time zone,
	"repository" text NOT NULL,
	"review" text DEFAULT 'unknown' NOT NULL,
	"server_id" text NOT NULL,
	"settled_at" timestamp with time zone,
	"source" text NOT NULL,
	"state" text NOT NULL,
	"title" text,
	"url" text NOT NULL,
	CONSTRAINT "cloud_agent_pull_requests_pkey" PRIMARY KEY("server_id","repository","number"),
	CONSTRAINT "cloud_agent_pull_requests_checks_check" CHECK ("cloud_agent_pull_requests"."checks" in ('none', 'pending', 'passing', 'failing', 'unknown')),
	CONSTRAINT "cloud_agent_pull_requests_review_check" CHECK ("cloud_agent_pull_requests"."review" in ('none', 'approved', 'changes-requested', 'unknown')),
	CONSTRAINT "cloud_agent_pull_requests_source_check" CHECK ("cloud_agent_pull_requests"."source" in ('computer', 'github')),
	CONSTRAINT "cloud_agent_pull_requests_state_check" CHECK ("cloud_agent_pull_requests"."state" in ('draft', 'open', 'merged', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "cloud_agent_pull_requests" ADD CONSTRAINT "cloud_agent_pull_requests_server_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_agent_pull_requests_head_idx" ON "cloud_agent_pull_requests" USING btree ("server_id","repository","head_sha");--> statement-breakpoint
CREATE INDEX "cloud_agent_pull_requests_refresh_idx" ON "cloud_agent_pull_requests" USING btree ("refresh_requested_at") WHERE "cloud_agent_pull_requests"."refresh_requested_at" is not null;--> statement-breakpoint
INSERT INTO "cloud_agent_pull_requests" (
	"server_id", "repository", "number", "url", "state", "additions", "changed_files",
	"deletions", "observed_at", "source", "refresh_requested_at"
)
SELECT DISTINCT ON (reported.server_id, reported.repository, reported.number)
	reported.server_id,
	reported.repository,
	reported.number,
	reported.url,
	reported.snapshot->>'state',
	(reported.snapshot->>'additions')::integer,
	(reported.snapshot->>'changedFiles')::integer,
	(reported.snapshot->>'deletions')::integer,
	(reported.snapshot->>'observedAt')::timestamptz,
	'computer',
	CASE WHEN reported.snapshot->>'state' IN ('draft', 'open') THEN now() END
FROM (
	SELECT
		run.server_id,
		lower(matched[1]) AS repository,
		matched[2]::integer AS number,
		branch->>'pullRequestUrl' AS url,
		branch->'pullRequest' AS snapshot
	FROM "cloud_agent_runs" run
	CROSS JOIN LATERAL jsonb_array_elements(run.branches) branch
	CROSS JOIN LATERAL regexp_match(
		branch->>'pullRequestUrl',
		'^https://github\.com/([^/]+/[^/]+)/pull/(\d+)(?:[/?#]|$)'
	) matched
	WHERE jsonb_typeof(branch->'pullRequest') = 'object'
) reported
ORDER BY
	reported.server_id,
	reported.repository,
	reported.number,
	(reported.snapshot->>'observedAt')::timestamptz DESC;
