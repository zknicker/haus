import * as z from 'zod';
import { idSchema } from './chat.ts';

const timestampSchema = z.iso.datetime({ offset: true });
const tokenCountSchema = z.number().int().nonnegative();

/**
 * What fills an Agent's one global session (specs/sessions.md "Context"), in the order the App
 * lists it: the composed system prompt, the tool schemas, the skill listing, the rules and memory
 * the runner delivered, and everything the conversation added.
 */
export const agentContextSectionIdSchema = z.enum([
    'system-prompt',
    'tools',
    'skills',
    'memory',
    'conversation',
]);

export type AgentContextSectionId = z.infer<typeof agentContextSectionIdSchema>;

export const agentContextSectionSchema = z
    .object({ id: agentContextSectionIdSchema, tokens: tokenCountSchema })
    .strict();

/**
 * `harness` sections come from the harness's own token accounting; `measured` sections are the
 * runner's estimates around the provider's real total.
 */
export const agentContextSourceSchema = z.enum(['harness', 'measured']);

export const agentContextSnapshotSchema = z
    .object({
        agentId: idSchema,
        /** Where the harness compacts the session, never above the model window. */
        compactAtTokens: z.number().int().positive(),
        contextWindow: z.number().int().positive(),
        measuredAt: timestampSchema,
        modelId: z.string().trim().min(1),
        sections: z
            .array(agentContextSectionSchema)
            .max(agentContextSectionIdSchema.options.length),
        sessionGeneration: z.number().int().nonnegative(),
        source: agentContextSourceSchema,
        usedTokens: tokenCountSchema,
    })
    .strict()
    .refine((snapshot) => snapshot.compactAtTokens <= snapshot.contextWindow, {
        message: 'The compaction threshold cannot exceed the model window.',
        path: ['compactAtTokens'],
    })
    .refine(
        (snapshot) =>
            new Set(snapshot.sections.map((section) => section.id)).size ===
            snapshot.sections.length,
        {
            message: 'Each context section appears once.',
            path: ['sections'],
        }
    );

export type AgentContextSnapshot = z.infer<typeof agentContextSnapshotSchema>;

/** Runner→Server after a turn settles: the Agent session's context as the next turn will see it. */
export const agentContextReportSchema = z
    .object({
        runId: idSchema,
        snapshot: agentContextSnapshotSchema,
        type: z.literal('agent-context'),
    })
    .strict();

export type AgentContextReport = z.infer<typeof agentContextReportSchema>;

export const agentContextInputSchema = z.object({ agentId: idSchema, serverId: idSchema }).strict();

export type AgentContextInput = z.infer<typeof agentContextInputSchema>;

/** `agent.context`: the latest snapshot of the Agent's current session, or null before its first turn. */
export const agentContextSchema = z
    .object({ snapshot: agentContextSnapshotSchema.nullable() })
    .strict();

export type AgentContext = z.infer<typeof agentContextSchema>;
