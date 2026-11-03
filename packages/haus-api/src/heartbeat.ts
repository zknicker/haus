import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

/** `POST /api/agent/heartbeat/report`: the run's one report to the main session. */
export const heartbeatReportInputSchema = z
    .object({ text: z.string().trim().min(1).max(4000) })
    .strict();

export type HeartbeatReportInput = z.infer<typeof heartbeatReportInputSchema>;

export const heartbeatReportResponseSchema = z.object({ queued: z.literal(true) }).strict();

export type HeartbeatReportResponse = z.infer<typeof heartbeatReportResponseSchema>;

/** `POST /api/agent/heartbeat/learned`: what a dream learned, stored by run id. */
export const heartbeatLearnedInputSchema = z
    .object({ text: z.string().trim().min(1).max(2000) })
    .strict();

export type HeartbeatLearnedInput = z.infer<typeof heartbeatLearnedInputSchema>;

export const heartbeatLearnedResponseSchema = z.object({ saved: z.literal(true) }).strict();

export type HeartbeatLearnedResponse = z.infer<typeof heartbeatLearnedResponseSchema>;

/** `POST /api/agent/leads`: claim a topic so another Agent does not chase it too. */
export const leadClaimInputSchema = z
    .object({
        messageId: idSchema.optional(),
        topic: z.string().trim().min(1).max(200),
    })
    .strict();

export type LeadClaimInput = z.infer<typeof leadClaimInputSchema>;

export const leadSchema = z
    .object({
        agentHandle: z.string().min(1).max(128),
        agentId: idSchema,
        anchorChatId: idSchema.nullable(),
        anchorMessageId: idSchema.nullable(),
        createdAt: timestampSchema,
        doneAt: timestampSchema.nullable(),
        finding: z.string().nullable(),
        id: idSchema,
        topic: z.string().min(1).max(200),
    })
    .strict();

export type Lead = z.infer<typeof leadSchema>;

/** `GET /api/agent/leads`: leads from the last 7 days. */
export const leadListResponseSchema = z.object({ leads: z.array(leadSchema) }).strict();

export type LeadListResponse = z.infer<typeof leadListResponseSchema>;

/** `POST /api/agent/leads/:id/done`. */
export const leadDoneInputSchema = z
    .object({ finding: z.string().trim().min(1).max(1000) })
    .strict();

export type LeadDoneInput = z.infer<typeof leadDoneInputSchema>;

/** A claim lost to another Agent's live lead on the same topic. */
export const leadClaimConflictSchema = z
    .object({
        claimed: z.literal(false),
        heldBy: z.object({ agentHandle: z.string().min(1), agentId: idSchema }).strict(),
        leadId: idSchema,
    })
    .strict();

export type LeadClaimConflict = z.infer<typeof leadClaimConflictSchema>;

export const leadClaimedSchema = z.object({ claimed: z.literal(true), lead: leadSchema }).strict();

/** A claim either holds the lead or names who already does. */
export const leadClaimResultSchema = z.discriminatedUnion('claimed', [
    leadClaimedSchema,
    leadClaimConflictSchema,
]);

export type LeadClaimResult = z.infer<typeof leadClaimResultSchema>;
