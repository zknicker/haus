import * as z from 'zod';
import { createdAgentSummarySchema } from './agent-creation.ts';
import { idSchema } from './chat-contract-primitives.ts';
import { workerReportOutcomeSchema } from './worker-outcome.ts';

export const messageBodyKinds = [
    'text',
    'agent-created',
    'worker-report',
    'worker-follow-up',
] as const;

export type MessageBodyKind = (typeof messageBodyKinds)[number];

/**
 * The Server-validated typed body one Message carries (ADR 0025). `text` is
 * every ordinary Message; `agent-created` projects the Server record its
 * Message anchors. `worker-report` is a Worker turn's report its delegating
 * Agent posted, and `worker-follow-up` a person's follow-up to a Worker from
 * its card (specs/workers.md). Unknown kinds do not exist on the wire — a
 * client that has not learned a kind degrades through the Message `content`.
 */
export const messageBodySchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text') }).strict(),
    z.object({ agent: createdAgentSummarySchema, kind: z.literal('agent-created') }).strict(),
    z
        .object({
            kind: z.literal('worker-report'),
            outcome: workerReportOutcomeSchema,
            turnId: idSchema,
            workerId: idSchema,
        })
        .strict(),
    z.object({ kind: z.literal('worker-follow-up'), workerId: idSchema }).strict(),
]);

export type MessageBody = z.infer<typeof messageBodySchema>;
