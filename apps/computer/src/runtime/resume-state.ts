import * as z from 'zod';

/**
 * What a parked Agent session needs to resume, stored in the Agent's `session.json`. Each Haus
 * driver owns one versioned shape keyed by `runtime`; the conversation itself stays in the
 * runtime's own store under the Agent's isolated HOME (specs/runtime-drivers.md).
 */
const claudeResumeStateSchema = z.object({
    /** Claude Code's conversation id, passed back as `--resume`. */
    claudeSessionId: z.string().min(1),
    runtime: z.literal('claude-code'),
    version: z.literal(1),
});

const codexResumeStateSchema = z.object({
    runtime: z.literal('codex'),
    /** The app-server thread resumed with `thread/resume`. */
    threadId: z.string().min(1),
    version: z.literal(1),
});

const grokResumeStateSchema = z.object({
    runtime: z.literal('grok-build'),
    /** The ACP session reloaded with `session/load`. */
    sessionId: z.string().min(1),
    version: z.literal(1),
});

const hausResumeStateSchema = z.discriminatedUnion('runtime', [
    claudeResumeStateSchema,
    codexResumeStateSchema,
    grokResumeStateSchema,
]);

export type ClaudeResumeState = z.infer<typeof claudeResumeStateSchema>;
export type CodexResumeState = z.infer<typeof codexResumeStateSchema>;
export type GrokResumeState = z.infer<typeof grokResumeStateSchema>;
export type HausResumeState = z.infer<typeof hausResumeStateSchema>;

/**
 * The retired AI SDK harness's opaque resume state, still stored by Agents that have not run
 * since the drivers replaced it. Each driver converts it on first open
 * (`legacy-resume-state.ts`).
 */
export type LegacyHarnessResumeState = Readonly<Record<string, unknown>>;

/**
 * Stored resume state this Computer cannot read: a newer or unknown version, a damaged Haus
 * shape, or a non-object. It still names a native conversation the stored generation used, so
 * every driver rejects it (`toHausResumeState`) and the executor rotates like any other rejected
 * resume instead of silently cold-starting under the same generation.
 */
export class UnreadableResumeState {
    readonly stored: unknown;

    constructor(stored: unknown) {
        this.stored = stored;
    }
}

export type RuntimeResumeState = HausResumeState | LegacyHarnessResumeState | UnreadableResumeState;

/**
 * Validates a stored resume state at the disk boundary. Only an absent state is null. A
 * Haus-shaped state must parse exactly; anything else object-shaped is a legacy harness state a
 * driver converts on open; the rest is unreadable.
 */
export function parseRuntimeResumeState(value: unknown): RuntimeResumeState | null {
    if (value === null || value === undefined) {
        return null;
    }
    if (!isRecord(value)) {
        return new UnreadableResumeState(value);
    }
    if (!('runtime' in value || 'version' in value)) {
        return value;
    }
    const parsed = hausResumeStateSchema.safeParse(value);
    return parsed.success ? parsed.data : new UnreadableResumeState(value);
}

export function isHausResumeState(state: RuntimeResumeState): state is HausResumeState {
    return hausResumeStateSchema.safeParse(state).success;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
