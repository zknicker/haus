import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentReasoningEffort } from '@haus/api';

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
    effectiveModel: { modelId: string; runtimeId: string };
    effectiveReasoningEffort?: AgentReasoningEffort;
    generation: number;
    hausAgentAppliedAt: string | null;
    hausAgentStatus: 'current' | 'failed' | 'pending';
    hausAgentVersion: string | null;
    instructionFingerprint: string | null;
    resumeState: Record<string, unknown> | null;
    runtimeSessionId: string | null;
}

export interface AgentSessionTokenUsage {
    cacheReadTokens: number;
    cacheWriteTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

const sessionFileName = 'session.json';

export async function readAgentSessionState(agentRoot: string): Promise<AgentSessionState | null> {
    try {
        const raw = await readFile(join(agentRoot, sessionFileName), 'utf8');
        // `cumulativeTokenUsage` was the `codex exec` usage baseline; drop it on read.
        const { cumulativeTokenUsage: _codexExecBaseline, ...parsed } = JSON.parse(
            raw
        ) as AgentSessionState & { cumulativeTokenUsage?: unknown };
        if (
            typeof parsed.generation === 'number' &&
            typeof parsed.effectiveModel?.modelId === 'string' &&
            typeof parsed.effectiveModel?.runtimeId === 'string'
        ) {
            return {
                ...parsed,
                bootstrapFingerprint: parseFingerprint(parsed.bootstrapFingerprint),
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
