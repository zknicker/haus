import type { WorkerQuestions } from '@haus/api';
import { claudeAskQuestions } from './claude-ask-questions.ts';
import type { ClaudeControlRequest } from './claude-messages.ts';

export const askedMessage =
    'Haus delivered your questions to the person and ended this turn. Their answer arrives as your next message.';
export const refusedMessage =
    'Haus Workers run without permission prompts, so this request was refused. Continue without it, or report needs-you with `haus worker report`.';

/**
 * Answers Claude Code's `can_use_tool` requests for a Worker: an `AskUserQuestion` is captured
 * once and ends the turn, and every other request is denied.
 */
export function claudeToolGate(
    onQuestion: ((questions: WorkerQuestions) => Promise<void>) | undefined
) {
    let asked = false;
    return async (request: ClaudeControlRequest['request']) => {
        if (!(onQuestion && request.tool_name === 'AskUserQuestion')) {
            return deny(refusedMessage);
        }
        if (asked) {
            return deny('You already asked this turn. Wait for the answer.', true);
        }
        const parsed = claudeAskQuestions(request.input);
        if (!parsed.ok) {
            return deny(`Haus could not read these questions. ${parsed.error} Ask again.`);
        }
        asked = true;
        try {
            await onQuestion(parsed.questions);
        } catch {
            asked = false;
            return deny(
                'Haus could not deliver your questions. Report needs-you with `haus worker report --ask` instead.'
            );
        }
        return deny(askedMessage, true);
    };
}

function deny(message: string, interrupt = false) {
    return { behavior: 'deny', message, ...(interrupt ? { interrupt } : {}) } as const;
}
