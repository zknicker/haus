import * as z from 'zod';
import { idSchema } from './chat.ts';
import { cloudAgentObservationSchema, cloudAgentReconcileEntrySchema } from './cloud-agent.ts';
import { cloudAgentCapabilityStateSchema, cloudAgentProviderSchema } from './cloud-agent-shared.ts';

/**
 * Server-recorded cancellation riding down to the Computer that owns the
 * provider access. The Run settles through the ordinary observation path.
 */
export const cloudAgentCancelCommandSchema = z
    .object({
        provider: cloudAgentProviderSchema,
        providerAgentId: z.string().trim().min(1).max(200).nullable(),
        providerRunId: z.string().trim().min(1).max(200).nullable(),
        runId: idSchema,
        type: z.literal('cloud-agent-cancel'),
        workId: idSchema,
    })
    .strict();

export type CloudAgentCancelCommand = z.infer<typeof cloudAgentCancelCommandSchema>;

/**
 * Every non-terminal work assigned to this Computer, sent once per reconnect.
 * The Computer reads each Run from the provider and reports an observation, so
 * work that settled while the socket was down still settles here.
 */
export const cloudAgentReconcileCommandSchema = z
    .object({
        type: z.literal('cloud-agent-reconcile'),
        work: z.array(cloudAgentReconcileEntrySchema).max(200),
    })
    .strict();

export type CloudAgentReconcileCommand = z.infer<typeof cloudAgentReconcileCommandSchema>;

/**
 * One authenticated Server request against this Computer's Cloud Agent
 * provider access, shaped like the Browser request for the same reason: the
 * App never touches a Computer socket, and provider credentials never leave
 * the machine. `connect` returns the sign-in link while Computer waits for
 * approval and stores the key in the provider's credential store; `disconnect`
 * forgets it. Haus never opens that flow during an Agent turn.
 */
export const cloudAgentCapabilityRequestSchema = z
    .object({
        operation: z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('get') }).strict(),
            z.object({ kind: z.literal('connect') }).strict(),
            z.object({ kind: z.literal('cancel-sign-in') }).strict(),
            z.object({ kind: z.literal('disconnect') }).strict(),
        ]),
        provider: cloudAgentProviderSchema,
        requestId: idSchema,
        type: z.literal('cloud-agent-capability-request'),
    })
    .strict();

export type CloudAgentCapabilityRequest = z.infer<typeof cloudAgentCapabilityRequestSchema>;

export const cloudAgentCapabilityResultSchema = z
    .object({
        error: z.string().trim().min(1).max(500).optional(),
        requestId: idSchema,
        result: cloudAgentCapabilityStateSchema.optional(),
        type: z.literal('cloud-agent-capability-result'),
    })
    .strict()
    .refine((value) => Boolean(value.error) !== Boolean(value.result));

export type CloudAgentCapabilityResult = z.infer<typeof cloudAgentCapabilityResultSchema>;

/** One bounded Computer observation of a provider Run, applied idempotently. */
export const cloudAgentObservationFrameSchema = z
    .object({
        observation: cloudAgentObservationSchema,
        type: z.literal('cloud-agent-observation'),
    })
    .strict();

export type CloudAgentObservationFrame = z.infer<typeof cloudAgentObservationFrameSchema>;
