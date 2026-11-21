import type { ScreenRefusal } from '@haus/api';
import type { OperationResult } from '../invocations/operation.ts';

const refusalTexts: Record<ScreenRefusal, string> = {
    locked: "This Mac's screen is locked; no computer use runs on a locked Mac. Ask the person to unlock it.",
    'no-session':
        "Nobody is logged in on this Mac's screen; no computer use runs without a logged-in session. Ask the person to log in.",
    'switched-out':
        "Another user has this Mac's screen; no computer use runs while this user is switched out. Ask the person to switch back.",
};

export function refusalResult(refusal: ScreenRefusal) {
    return {
        outcome: 'failed',
        output: { kind: 'text', text: refusalTexts[refusal] },
        refusal,
        truncated: false,
    } satisfies OperationResult;
}
