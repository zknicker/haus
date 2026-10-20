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
 * The AI SDK harness's opaque `HarnessAgentResumeSessionState`, which only the temporary
 * adapter (`ai-sdk-adapter.ts`) reads. It goes with the adapter.
 */
export type LegacyHarnessResumeState = Readonly<Record<string, unknown>>;

export type RuntimeResumeState = HausResumeState | LegacyHarnessResumeState;

/**
 * Validates a stored resume state at the disk boundary. A Haus-shaped state must parse exactly;
 * anything else object-shaped is a legacy harness state the adapter still owns.
 */
export function parseRuntimeResumeState(value: unknown): RuntimeResumeState | null {
    if (!isRecord(value)) {
        return null;
    }
    if (!('runtime' in value && 'version' in value)) {
        return value;
    }
    const parsed = hausResumeStateSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export function isHausResumeState(state: RuntimeResumeState): state is HausResumeState {
    return hausResumeStateSchema.safeParse(state).success;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
