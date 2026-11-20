import * as z from 'zod';
import { RuntimeResumeRejectedError } from './resume-rejected.ts';
import {
    type ClaudeResumeState,
    type CodexResumeState,
    type GrokResumeState,
    type HausResumeState,
    isHausResumeState,
    type RuntimeResumeState,
    UnreadableResumeState,
} from './resume-state.ts';

/**
 * The runtime ids a Haus driver resumes, each with its versioned resume-state shape.
 */
export interface HausResumeStates {
    'claude-code': ClaudeResumeState;
    codex: CodexResumeState;
    'grok-build': GrokResumeState;
}

export type HausRuntimeId = keyof HausResumeStates;

/**
 * The AI SDK harness stored `{ type: 'resume-session', harnessId, data }`. Verified against real
 * `session.json` files: Claude Code kept its conversation under `data.claudeSessionId`, and the
 * ACP harness kept the native session under `data.acpSessionId`, which for Codex is the
 * app-server thread id (its rollout file is named by it) and for Grok Build is the ACP session
 * `session/load` reopens.
 */
const legacyClaudeSchema = z.looseObject({
    data: z.looseObject({ claudeSessionId: z.string().min(1) }),
    harnessId: z.literal('claude-code'),
});
const legacyAcpSchema = z.looseObject({
    data: z.looseObject({ acpSessionId: z.string().min(1) }),
    harnessId: z.enum(['codex', 'grok-build']),
});

/**
 * Converts stored resume state to `runtimeId`'s Haus shape. A legacy harness state converts on
 * the first open after the driver replaced the harness, so an existing Agent keeps its
 * conversation; state the runtime cannot resume is a typed resume rejection.
 */
export function toHausResumeState<Runtime extends HausRuntimeId>(
    runtimeId: Runtime,
    state: RuntimeResumeState
): HausResumeStates[Runtime] {
    if (state instanceof UnreadableResumeState) {
        throw new RuntimeResumeRejectedError(
            runtimeId,
            'invalid-state',
            `The stored ${runtimeId} session state is not one this Computer can read.`
        );
    }
    const converted = isHausResumeState(state) ? state : fromLegacy(runtimeId, state);
    if (converted.runtime !== runtimeId) {
        throw new RuntimeResumeRejectedError(
            runtimeId,
            'foreign-state',
            `The stored session belongs to ${converted.runtime}, not ${runtimeId}.`
        );
    }
    return converted as HausResumeStates[Runtime];
}

function fromLegacy(runtimeId: HausRuntimeId, state: RuntimeResumeState): HausResumeState {
    const claude = legacyClaudeSchema.safeParse(state);
    if (claude.success) {
        return {
            claudeSessionId: claude.data.data.claudeSessionId,
            runtime: 'claude-code',
            version: 1,
        };
    }
    const acp = legacyAcpSchema.safeParse(state);
    if (acp.success) {
        return acp.data.harnessId === 'codex'
            ? { runtime: 'codex', threadId: acp.data.data.acpSessionId, version: 1 }
            : { runtime: 'grok-build', sessionId: acp.data.data.acpSessionId, version: 1 };
    }
    const harness = 'harnessId' in state ? String(state.harnessId) : 'an unknown harness';
    throw new RuntimeResumeRejectedError(
        runtimeId,
        harness === runtimeId ? 'invalid-state' : 'foreign-state',
        `The stored ${harness} harness state holds no ${runtimeId} conversation to resume.`
    );
}
