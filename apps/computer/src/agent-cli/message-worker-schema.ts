import { cloudAgentProviderSchema, workerTurnStatusSchema } from '@haus/api';
import * as z from 'zod';

/** The Worker a Message carries, as the Agent API spells it. */
export const messageWorkerSchema = z.object({
    activity: z.string().nullable(),
    id: z.string(),
    latest_turn: z
        .object({
            branches: z.array(
                z.object({
                    branch: z.string(),
                    pull_request_url: z.string().nullable(),
                    repository: z.string(),
                })
            ),
            error_code: z.string().nullable(),
            turn_id: z.string(),
            status: workerTurnStatusSchema,
            summary: z.string().nullable(),
        })
        .nullable(),
    provider: cloudAgentProviderSchema,
    provider_url: z.string().nullable(),
    repository: z.string(),
    starting_ref: z.string().nullable(),
    status: workerTurnStatusSchema,
    title: z.string(),
});
