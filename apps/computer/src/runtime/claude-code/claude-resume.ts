import * as z from 'zod';
import {
    type ClaudeResumeState,
    isHausResumeState,
    type RuntimeResumeState,
} from '../resume-state.ts';
import { ClaudeResumeStateError } from './claude-errors.ts';

/**
 * The AI SDK Claude Code harness's stored state: `{ type, harnessId: 'claude-code', data }`, the
 * conversation id under `data.claudeSessionId` (@ai-sdk/harness-claude-code 1.0.153 `doStop`
 * and `doSuspendTurn`). Read once, on the first open after the driver replaced the harness.
 */
const legacyHarnessStateSchema = z.looseObject({
    data: z.looseObject({ claudeSessionId: z.string().min(1) }),
    harnessId: z.literal('claude-code'),
});

/** The Claude conversation a stored state resumes, or `undefined` for a fresh session. */
export function claudeResumeSessionId(state: RuntimeResumeState | undefined): string | undefined {
    if (!state) {
        return;
    }
    if (isHausResumeState(state)) {
        if (state.runtime !== 'claude-code') {
            throw new ClaudeResumeStateError(`the stored session belongs to ${state.runtime}`);
        }
        return state.claudeSessionId;
    }
    const legacy = legacyHarnessStateSchema.safeParse(state);
    if (!legacy.success) {
        throw new ClaudeResumeStateError('no Claude conversation id is stored');
    }
    return legacy.data.data.claudeSessionId;
}

export function claudeResumeState(claudeSessionId: string): ClaudeResumeState {
    return { claudeSessionId, runtime: 'claude-code', version: 1 };
}
