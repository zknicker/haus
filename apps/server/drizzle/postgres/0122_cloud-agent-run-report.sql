ALTER TABLE "cloud_agent_runs" ADD COLUMN "report" jsonb;--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD CONSTRAINT "cloud_agent_runs_report_shape" CHECK ("cloud_agent_runs"."report" is null or (
                jsonb_typeof("cloud_agent_runs"."report") = 'object'
                and char_length("cloud_agent_runs"."report"->>'text') between 1 and 65536
                and jsonb_typeof("cloud_agent_runs"."report"->'clipped') = 'boolean'
            ));