import {
    type ClaudeResumeState,
    type RuntimeResumeState,
    resumeStateFor,
} from '../resume-state.ts';

/** The Claude conversation a stored state resumes, or `undefined` for a fresh session. */
export function claudeResumeSessionId(state: RuntimeResumeState | undefined) {
    return state ? resumeStateFor('claude-code', state).claudeSessionId : undefined;
}

export function claudeResumeState(claudeSessionId: string) {
    return { claudeSessionId, runtime: 'claude-code', version: 1 } satisfies ClaudeResumeState;
}
