import { toHausResumeState } from '../legacy-resume-state.ts';
import type { GrokResumeState, RuntimeResumeState } from '../resume-state.ts';

/** The Grok session to `session/load` for stored resume state; `undefined` opens a fresh one. */
export function grokResumeSessionId(state: RuntimeResumeState | undefined): string | undefined {
    return state ? toHausResumeState('grok-build', state).sessionId : undefined;
}

export function grokResumeState(sessionId: string): GrokResumeState {
    return { runtime: 'grok-build', sessionId, version: 1 };
}
