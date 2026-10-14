import { cloudAgentProviderSchema, cloudAgentStatusSchema } from '@haus/api';
import * as z from 'zod';

/** The Cloud Agent work a Message carries, as the Agent API spells it. */
export const messageCloudAgentWorkSchema = z.object({
    activity: z.string().nullable(),
    id: z.string(),
    latest_run: z
        .object({
            branches: z.array(
                z.object({
                    branch: z.string(),
                    pull_request_url: z.string().nullable(),
                    repository: z.string(),
                })
            ),
            error_code: z.string().nullable(),
            run_id: z.string(),
            status: cloudAgentStatusSchema,
            summary: z.string().nullable(),
        })
        .nullable(),
    provider: cloudAgentProviderSchema,
    provider_url: z.string().nullable(),
    repository: z.string(),
    starting_ref: z.string().nullable(),
    status: cloudAgentStatusSchema,
    title: z.string(),
});
