import * as z from 'zod';
import { createdAgentSummarySchema } from './agent-creation.ts';

export const messageBodyKinds = ['text', 'agent-created'] as const;

export type MessageBodyKind = (typeof messageBodyKinds)[number];

/**
 * The Server-validated typed body one Message carries (ADR 0025). `text` is
 * every ordinary Message; `agent-created` projects the Server record its
 * Message anchors. Cloud Agent work is linked from text, never a body (ADR 0044). Unknown kinds do not exist
 * on the wire — a client that has not learned a kind degrades through the
 * Message `content`.
 */
export const messageBodySchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text') }).strict(),
    z.object({ agent: createdAgentSummarySchema, kind: z.literal('agent-created') }).strict(),
]);

export type MessageBody = z.infer<typeof messageBodySchema>;
