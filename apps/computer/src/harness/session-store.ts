import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentReasoningEffort } from '@haus/api';
import { parseRuntimeResumeState, type RuntimeResumeState } from '../runtime/resume-state.ts';
import type { RuntimeTokenUsage } from '../runtime/turn-event.ts';

/**
 * One global persistent session per Agent (ADR 0011/0019), stored Computer-local
 * under the Agent's partition — the Computer's equivalent of Runtime's
 * `agent_sessions` table. The engine `runtimeSessionId` + opaque `resumeState`
 * are what let the next turn resume the same context; `effectiveModel` is fixed
 * at session start, so a runtime/model change rotates the generation and the
 * next turn cold-starts (specs/sessions.md).
 */
export interface AgentSessionState {
    bootstrapFingerprint: string | null;
    /**
     * The stable instruction fingerprint (`composeAgentInstructions`) this native session has
     * actually received: as its launch instructions, or as an update in a turn's input. A fresh
     * launch writes it however its turn ends; an update only a completed turn writes. Null means
     * no record, which the next resumed turn treats as stale (`instructions-update.ts`).
     */
    deliveredInstructionFingerprint: string | null;
    effectiveModel: { modelId: string; runtimeId: string };
    effectiveReasoningEffort?: AgentReasoningEffort;
    generation: number;
    hausAgentAppliedAt: string | null;
    hausAgentStatus: 'current' | 'failed' | 'pending';
    hausAgentVersion: string | null;
    /** The exact fingerprint of the instructions last delivered, host facts included. */
    instructionFingerprint: string | null;
    /**
     * The last turn was interrupted by Stop, restart, shutdown, or the no-progress deadline. The
     * next resumed prompt says so, because the runtime records the cancelled tool call as the
     * user declining it. Any completed turn clears it.
     */
    interruptedTurn?: true;
    resumeState: RuntimeResumeState | null;
    runtimeSessionId: string | null;
}

export type AgentSessionTokenUsage = RuntimeTokenUsage;

const sessionFileName = 'session.json';

export async function readAgentSessionState(agentRoot: string): Promise<AgentSessionState | null> {
    try {
        const raw = await readFile(join(agentRoot, sessionFileName), 'utf8');
        // `cumulativeTokenUsage` was the `codex exec` usage baseline; drop it on read.
        const { cumulativeTokenUsage: _codexExecBaseline, ...stored } = JSON.parse(
            raw
        ) as AgentSessionState & { cumulativeTokenUsage?: unknown };
        const { interruptedTurn, ...rest } = stored;
        const parsed = {
            ...rest,
            ...(interruptedTurn === true ? { interruptedTurn } : {}),
            resumeState: parseRuntimeResumeState(stored.resumeState),
        };
        if (
            typeof parsed.generation === 'number' &&
            typeof parsed.effectiveModel?.modelId === 'string' &&
            typeof parsed.effectiveModel?.runtimeId === 'string'
        ) {
            return {
                ...parsed,
                bootstrapFingerprint: parseFingerprint(parsed.bootstrapFingerprint),
                deliveredInstructionFingerprint: parseFingerprint(
                    parsed.deliveredInstructionFingerprint
                ),
                hausAgentAppliedAt: parseTimestamp(parsed.hausAgentAppliedAt),
                hausAgentStatus: parseHausAgentStatus(parsed.hausAgentStatus),
                hausAgentVersion: parseSemver(parsed.hausAgentVersion),
                instructionFingerprint: parseFingerprint(parsed.instructionFingerprint),
            };
        }
        return null;
    } catch {
        return null;
    }
}

export async function writeAgentSessionState(
    agentRoot: string,
    state: AgentSessionState
): Promise<void> {
    // Atomic temporary-write-and-rename, matching the Computer's other small
    // records (ADR 0019): a crash mid-write never leaves a torn session file.
    const destination = join(agentRoot, sessionFileName);
    const temporary = `${destination}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await rename(temporary, destination);
}

/**
 * Resolves the session this turn runs against. A fresh Agent, or one whose
 * stored `effectiveModel` no longer matches the assigned runtime/model, starts a
 * new generation with no resume state (cold start); otherwise the current
 * generation resumes.
 */
export function resolveTurnSession(
    stored: AgentSessionState | null,
    assigned: { generation: number; modelId: string; runtimeId: string }
): AgentSessionState {
    const modelChanged =
        stored !== null &&
        (stored.effectiveModel.runtimeId !== assigned.runtimeId ||
            stored.effectiveModel.modelId !== assigned.modelId);
    if (stored === null || modelChanged || stored.generation !== assigned.generation) {
        return {
            bootstrapFingerprint: null,
            deliveredInstructionFingerprint: null,
            effectiveModel: { modelId: assigned.modelId, runtimeId: assigned.runtimeId },
            generation: assigned.generation,
            hausAgentAppliedAt: null,
            hausAgentStatus: 'pending',
            hausAgentVersion: null,
            instructionFingerprint: null,
            resumeState: null,
            runtimeSessionId: null,
        };
    }
    return stored;
}

/**
 * Records a failed turn on its stored session. A failure keeps the generation, fingerprints, and
 * resume state for retry; only a failed Haus Agent version update is written.
 */
export async function writeFailedTurnSession(
    agentRoot: string,
    session: AgentSessionState,
    failure: { versionFailed: boolean }
): Promise<void> {
    // A failed cold start persists nothing; its generation persists only once a turn succeeds.
    if (!failure.versionFailed) {
        return;
    }
    await writeAgentSessionState(agentRoot, { ...session, hausAgentStatus: 'failed' });
}

function parseFingerprint(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseHausAgentStatus(value: unknown): AgentSessionState['hausAgentStatus'] {
    return value === 'current' || value === 'failed' || value === 'pending' ? value : 'pending';
}

function parseSemver(value: unknown): string | null {
    return typeof value === 'string' && /^\d+\.\d+\.\d+$/u.test(value) ? value : null;
}

function parseTimestamp(value: unknown): string | null {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** The prompt-facing view of the stored session for this turn. */
export function resumedTurnSession(
    session: AgentSessionState,
    isResume: boolean
): { isColdStart: boolean; resumesInterruptedTurn: boolean; sessionGeneration: number } {
    return {
        isColdStart: !isResume,
        resumesInterruptedTurn: isResume && session.interruptedTurn === true,
        sessionGeneration: session.generation,
    };
}
