import { workerReportTextMaxLength } from './worker-outcome.ts';
import type {
    WorkerQuestionAnswer,
    WorkerQuestions,
    WorkerQuestionsClosed,
} from './worker-questions.ts';

/** The report text a question report carries, so every text surface shows the questions. */
export function workerQuestionsText(questions: WorkerQuestions) {
    const numbered = questions.length > 1;
    const text = questions
        .map((question, index) => {
            const title = numbered ? `${index + 1}. ${question.question}` : question.question;
            const options = question.options.map((option) =>
                option.description
                    ? `- ${option.label}: ${option.description}`
                    : `- ${option.label}`
            );
            return [title, ...options].join('\n');
        })
        .join('\n\n');
    return text.slice(0, workerReportTextMaxLength);
}

/** The one-line ask a question report carries: the first question, and how many follow. */
export function workerQuestionsAsk(questions: WorkerQuestions) {
    const [first, ...rest] = questions;
    const more = rest.length > 0 ? ` (+${rest.length} more)` : '';
    return `${first?.question ?? ''}${more}`.slice(0, workerReportTextMaxLength);
}

/**
 * The follow-up text a card answer posts: Capy's numbered "**question** →
 * answer" list. An unanswered question reads "(no answer)".
 */
export function workerAnswersText(
    questions: WorkerQuestions,
    answers: ReadonlyArray<WorkerQuestionAnswer | null>
) {
    return questions
        .map((question, index) => {
            const answer = answers[index] ?? null;
            const parts = [...(answer?.labels ?? []), ...(answer?.text ? [answer.text] : [])];
            const value = parts.length > 0 ? parts.join(', ') : '(no answer)';
            return `${index + 1}. **${question.question}** → ${value}`;
        })
        .join('\n');
}

interface QuestionTurn {
    outcome: {
        kind: string;
        report?: { questions?: WorkerQuestions; questionsClosed?: WorkerQuestionsClosed };
    } | null;
    turnId: string;
}

/**
 * The newest turn's questions, when it asked some: open until answered (any
 * later turn), dismissed, stopped, or the Worker closes. `turns` is newest first.
 */
export function workerQuestionOf(worker: {
    closedAt: string | null;
    closingAt: string | null;
    turns: readonly QuestionTurn[];
}) {
    const [newest] = worker.turns;
    const report = newest?.outcome?.kind === 'report' ? newest.outcome.report : undefined;
    if (!(newest && report?.questions)) {
        return null;
    }
    return {
        closed: report.questionsClosed ?? null,
        open: !(report.questionsClosed || worker.closedAt || worker.closingAt),
        questions: report.questions,
        turnId: newest.turnId,
    };
}
