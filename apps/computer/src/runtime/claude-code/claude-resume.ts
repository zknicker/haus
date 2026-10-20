import { toHausResumeState } from '../legacy-resume-state.ts';
import type { ClaudeResumeState, RuntimeResumeState } from '../resume-state.ts';

/** The Claude conversation a stored state resumes, or `undefined` for a fresh session. */
export function claudeResumeSessionId(state: RuntimeResumeState | undefined): string | undefined {
    return state ? toHausResumeState('claude-code', state).claudeSessionId : undefined;
}

export function claudeResumeState(claudeSessionId: string): ClaudeResumeState {
    return { claudeSessionId, runtime: 'claude-code', version: 1 };
}
