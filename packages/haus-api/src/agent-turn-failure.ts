import * as z from 'zod';

const timestampSchema = z.iso.datetime({ offset: true });

export const agentTurnFailureKindSchema = z.enum([
    'authentication',
    'configuration',
    'input',
    'rate-limit',
    'session-resume',
    'timeout',
    'transport',
    'unknown',
]);

/**
 * The stable cause of a failed turn. `failureKind` picks the retry category;
 * the code names the specific failure so Server policy and App copy never
 * dispatch on error text.
 */
export const agentTurnFailureCodeSchema = z.enum([
    'authentication-required',
    'compaction-failed',
    'configuration-invalid',
    'context-too-large',
    'launch-failed',
    'model-unavailable',
    'provider-error',
    'provider-unavailable',
    'rate-limited',
    'runner-credential-failed',
    'runtime-not-installed',
    'session-resume-rejected',
    'start-rejected',
    'turn-stalled',
]);

export type AgentTurnFailureCode = z.infer<typeof agentTurnFailureCodeSchema>;

/** A Computer-computed hash of the normalized raw failure text; the text itself stays local. */
export const agentTurnFailureFingerprintSchema = z.string().regex(/^[0-9a-f]{16}$/);

/**
 * Present while the Server has paused automatic wakes after repeated failures.
 * Automatic work keeps queuing; one probe runs at `nextProbeAt`, and any human
 * message, Start, Restart, reset, or runtime/model change lifts the pause.
 */
export const agentWakePauseSchema = z
    .object({
        failureCount: z.number().int().positive(),
        lastFailure: z
            .object({
                at: timestampSchema,
                code: agentTurnFailureCodeSchema.nullable(),
                kind: agentTurnFailureKindSchema,
            })
            .strict(),
        /** Null while the probe run is in flight. */
        nextProbeAt: timestampSchema.nullable(),
        pausedAt: timestampSchema,
    })
    .strict();

export type AgentWakePause = z.infer<typeof agentWakePauseSchema>;
