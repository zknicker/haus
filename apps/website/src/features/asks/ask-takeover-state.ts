import {
    type AskQuestion,
    emptyAnswers,
    isAnswered,
    type QuestionAnswer,
    type QuestionRequest,
} from './ask-model.ts';

export interface AskTakeoverState {
    answers: readonly QuestionAnswer[];
    questions: readonly AskQuestion[];
    step: number;
}

export type AskTakeoverAction =
    | { kind: 'back' }
    | { kind: 'edit'; step: number }
    | { kind: 'enter' }
    | { index: number; kind: 'key' }
    | { kind: 'next' }
    | { kind: 'pick'; labels: readonly string[] }
    | { kind: 'send' }
    | { kind: 'type'; text: string };

export interface AskTakeoverStep {
    state: AskTakeoverState;
    submit: boolean;
}

export function askTakeoverStart(request: QuestionRequest) {
    return {
        answers: emptyAnswers(request),
        questions: request.questions,
        step: 0,
    } satisfies AskTakeoverState;
}

export function askTakeoverView(state: AskTakeoverState) {
    const total = state.questions.length;
    const reviewing = total > 1 && state.step >= total;
    return {
        answer: reviewing ? null : (state.answers[state.step] ?? null),
        canSend: state.answers.some(isAnswered),
        question: reviewing ? null : (state.questions[state.step] ?? null),
        reviewing,
        sends: total === 1 || reviewing,
        total,
    };
}

export function stepAskTakeover(state: AskTakeoverState, action: AskTakeoverAction) {
    const view = askTakeoverView(state);
    switch (action.kind) {
        case 'back':
            return stay({ ...state, step: Math.max(0, state.step - 1) });
        case 'edit':
            return stay({ ...state, step: clampStep(action.step, view.total) });
        case 'next':
            return stay(view.sends ? state : { ...state, step: state.step + 1 });
        case 'send':
            return { state, submit: view.sends && view.canSend } satisfies AskTakeoverStep;
        case 'type':
            return stay(answerWith(state, { text: action.text }));
        case 'enter':
            return isAnswered(view.answer ?? undefined) ? advance(state) : stay(state);
        case 'key': {
            const labels =
                view.question && view.answer
                    ? toggleOption(view.question, view.answer, action.index)
                    : null;
            return labels ? pick(state, labels) : stay(state);
        }
        case 'pick':
            return pick(state, action.labels);
    }
}

export function toggleOption(question: AskQuestion, answer: QuestionAnswer, index: number) {
    const option = question.options[index];
    if (!option) {
        return null;
    }
    if (!question.multiSelect) {
        return [option.label];
    }
    return answer.labels.includes(option.label)
        ? answer.labels.filter((label) => label !== option.label)
        : [...answer.labels, option.label];
}

function pick(state: AskTakeoverState, labels: readonly string[]) {
    const next = answerWith(state, { labels });
    const question = state.questions[state.step];
    return question && !question.multiSelect && labels.length > 0 ? advance(next) : stay(next);
}

function advance(state: AskTakeoverState) {
    if (state.questions.length === 1) {
        return { state, submit: askTakeoverView(state).canSend } satisfies AskTakeoverStep;
    }
    return stay({ ...state, step: state.step + 1 });
}

function answerWith(state: AskTakeoverState, patch: Partial<QuestionAnswer>) {
    return {
        ...state,
        answers: state.answers.map((answer, index) =>
            index === state.step ? { ...answer, ...patch } : answer
        ),
    };
}

function clampStep(step: number, total: number) {
    return Math.min(Math.max(0, step), Math.max(0, total - 1));
}

function stay(state: AskTakeoverState) {
    return { state, submit: false } satisfies AskTakeoverStep;
}
