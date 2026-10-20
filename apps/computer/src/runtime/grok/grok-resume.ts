import * as z from 'zod';
import {
    type GrokResumeState,
    isHausResumeState,
    type RuntimeResumeState,
} from '../resume-state.ts';

/**
 * The AI SDK harness's ACP state for Grok Build (`HarnessAgentResumeSessionState`), whose
 * `data.acpSessionId` is the Grok session it opened. Shape verified against a captured
 * harness-acp `session.json` (`type: "resume-session"`, `data.acpSessionId`).
 */
const legacyGrokStateSchema = z.looseObject({
    data: z.looseObject({ acpSessionId: z.string().min(1) }),
    harnessId: z.literal('grok-build'),
    type: z.literal('resume-session'),
});

/**
 * The Grok session to `session/load` for stored resume state. State another runtime wrote cannot
 * resume here; it throws in the wording resume-rejection.ts recognizes, so the executor rotates
 * to a fresh session instead of retrying.
 */
export function grokResumeSessionId(state: RuntimeResumeState | undefined): string | undefined {
    if (state === undefined) {
        return;
    }
    if (isHausResumeState(state)) {
        if (state.runtime === 'grok-build') {
            return state.sessionId;
        }
        throw new Error(`Grok Build session not found: the stored state is ${state.runtime}'s.`);
    }
    const legacy = legacyGrokStateSchema.safeParse(state);
    if (legacy.success) {
        return legacy.data.data.acpSessionId;
    }
    throw new Error('Grok Build session not found in the stored AI SDK harness state.');
}

export function grokResumeState(sessionId: string): GrokResumeState {
    return { runtime: 'grok-build', sessionId, version: 1 };
}
