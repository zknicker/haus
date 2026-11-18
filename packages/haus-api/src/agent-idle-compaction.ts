import * as z from 'zod';
import { agentTokenUsageSchema } from './agent-runner.ts';
import { idSchema } from './chat.ts';

const timestampSchema = z.iso.datetime({ offset: true });

/**
 * Computer→Server: an idle compaction finished on a parked Agent session (specs/runtime-drivers.md
 * "Idle compaction"). No run asked for it, so it settles no delivery; the Server records it as
 * the Agent's own completed turn under `compactionId`, so Usage counts what it spent. The usage is
 * the CLI's cumulative total across the compaction, which a compaction reports nowhere else.
 */
export const agentIdleCompactionReportSchema = z
    .object({
        agentId: idSchema,
        /** Minted by the Computer; also the run id its execution journal uploads under. */
        compactionId: z.string().regex(/^compaction-[A-Za-z0-9_-]{8,64}$/u),
        /** The CLI's API-equivalent cost for the compaction; null when it reported none. */
        costUsd: z.number().nonnegative().nullable(),
        endedAt: timestampSchema,
        modelId: z.string().trim().min(1),
        runtimeId: z.string().trim().min(1),
        startedAt: timestampSchema,
        tokenUsage: agentTokenUsageSchema.nullable(),
        tokensAfter: z.number().int().nonnegative().nullable(),
        tokensBefore: z.number().int().nonnegative().nullable(),
        type: z.literal('agent-idle-compaction'),
    })
    .strict();

export type AgentIdleCompactionReport = z.infer<typeof agentIdleCompactionReportSchema>;
