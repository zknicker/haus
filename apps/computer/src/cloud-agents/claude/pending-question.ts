import { type ClaudeLogEntry, lastOf } from './session-events.ts';

type Entry<Kind extends ClaudeLogEntry['kind']> = Extract<ClaudeLogEntry, { kind: Kind }>;

/** What the worker is waiting on: the open AskUserQuestion, else the tool it wants to use. */
export function questionOf(entries: ClaudeLogEntry[], pendingAction: unknown): string {
    const answered = new Set(
        entries.flatMap((entry) => (entry.kind === 'tool-result' ? [entry.toolUseId] : []))
    );
    const open = lastOf(
        entries,
        (entry): entry is Entry<'tool-use'> => entry.kind === 'tool-use' && !answered.has(entry.id)
    );
    if (open?.name === 'AskUserQuestion') {
        const asked = askedQuestions(open.input);
        if (asked) {
            return asked;
        }
    }
    if (open) {
        return `Claude is asking to use ${open.name}.`;
    }
    const described = typeof pendingAction === 'string' ? pendingAction.trim() : '';
    return described || 'Claude is waiting for an answer.';
}

function askedQuestions(input: unknown): string | null {
    const questions = (input as { questions?: unknown } | null)?.questions;
    if (!Array.isArray(questions)) {
        return null;
    }
    const lines = questions.flatMap((question: { options?: unknown; question?: unknown }) => {
        if (typeof question?.question !== 'string') {
            return [];
        }
        const options = Array.isArray(question.options)
            ? question.options.flatMap((option: { label?: unknown }) =>
                  typeof option?.label === 'string' ? [option.label] : []
              )
            : [];
        return [
            options.length > 0
                ? `${question.question} (${options.join(' / ')})`
                : question.question,
        ];
    });
    return lines.length > 0 ? lines.join('\n') : null;
}
