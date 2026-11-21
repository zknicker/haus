import { answerText } from '../asks/ask-copy.ts';
import type { QuestionAnswer, QuestionRequest } from '../asks/ask-model.ts';
import { workerName } from './asks-preview.fixture.ts';

export type PreviewAuthor = 'captain' | 'person' | 'worker';

export interface AnsweredQuestion {
    answer: string;
    question: string;
}

export type PreviewBody =
    | { kind: 'answers'; rows: readonly AnsweredQuestion[] }
    | { kind: 'text'; text: string };

export type PreviewItem =
    | { author: PreviewAuthor; body: PreviewBody; id: string; kind: 'message'; minute: number }
    | { id: string; kind: 'notice'; text: string };

export type AskPhase = 'closed' | 'later' | 'open';

export interface WorkerPreviewState {
    items: readonly PreviewItem[];
    phase: AskPhase;
    request: QuestionRequest;
}

export type WorkerPreviewAction =
    | { answers: readonly QuestionAnswer[]; kind: 'answer' }
    | { kind: 'dismiss' }
    | { kind: 'later' }
    | { kind: 'reopen' }
    | { kind: 'send'; text: string };

export function workerPreviewReducer(state: WorkerPreviewState, action: WorkerPreviewAction) {
    switch (action.kind) {
        case 'answer':
            return {
                ...state,
                items: followUp(state.items, {
                    kind: 'answers',
                    rows: state.request.questions.map((question, index) => ({
                        answer: answerText(action.answers[index] ?? { labels: [], text: '' }),
                        question: question.question,
                    })),
                }),
                phase: 'closed' as const,
            };
        case 'dismiss':
            return { ...state, phase: 'closed' as const };
        case 'later':
            return { ...state, phase: 'later' as const };
        case 'reopen':
            return { ...state, phase: 'open' as const };
        case 'send':
            return { ...state, items: followUp(state.items, { kind: 'text', text: action.text }) };
    }
}

function followUp(items: readonly PreviewItem[], body: PreviewBody) {
    const id = `follow-up-${items.length}`;
    const next: readonly PreviewItem[] = [
        ...items,
        { id: `${id}-notice`, kind: 'notice', text: `To ${workerName}` },
        { author: 'person', body, id, kind: 'message', minute: 6 + items.length },
    ];
    return next;
}
