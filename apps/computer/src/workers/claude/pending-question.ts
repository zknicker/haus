import { workerQuestionsText } from '@haus/api';
import { claudeAskQuestions } from '../../runtime/claude-code/claude-ask-questions.ts';
import { type ClaudeLogEntry, lastOf } from './session-events.ts';

type Entry<Kind extends ClaudeLogEntry['kind']> = Extract<ClaudeLogEntry, { kind: Kind }>;

/**
 * What the worker is waiting on: the open AskUserQuestion's structured questions, else the tool
 * it wants to use, which takes no card.
 */
export function pendingQuestionOf(entries: ClaudeLogEntry[], pendingAction: unknown) {
    const answered = new Set(
        entries.flatMap((entry) => (entry.kind === 'tool-result' ? [entry.toolUseId] : []))
    );
    const open = lastOf(
        entries,
        (entry): entry is Entry<'tool-use'> => entry.kind === 'tool-use' && !answered.has(entry.id)
    );
    if (open?.name === 'AskUserQuestion') {
        const asked = claudeAskQuestions(open.input);
        if (asked.ok) {
            return { questions: asked.questions, text: workerQuestionsText(asked.questions) };
        }
    }
    if (open) {
        return { questions: null, text: `Claude is asking to use ${open.name}.` };
    }
    const described = typeof pendingAction === 'string' ? pendingAction.trim() : '';
    return { questions: null, text: described || 'Claude is waiting for an answer.' };
}
