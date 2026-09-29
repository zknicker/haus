import * as z from 'zod';
import { createdAgentSummarySchema } from './agent-creation.ts';
import { cloudAgentWorkSchema } from './cloud-agent-shared.ts';

export const messageBodyKinds = ['text', 'cloud-agent-work', 'agent-created'] as const;

export type MessageBodyKind = (typeof messageBodyKinds)[number];

/**
 * The Server-validated typed body one Message carries (ADR 0025). `text` is
 * every ordinary Message; `cloud-agent-work` and `agent-created`
 * project the Server record their Message anchors. Unknown kinds do not exist
 * on the wire — a client that has not learned a kind degrades through the
 * Message `content`.
 */
export const messageBodySchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text') }).strict(),
    z.object({ kind: z.literal('cloud-agent-work'), work: cloudAgentWorkSchema }).strict(),
    z.object({ agent: createdAgentSummarySchema, kind: z.literal('agent-created') }).strict(),
]);

export type MessageBody = z.infer<typeof messageBodySchema>;
