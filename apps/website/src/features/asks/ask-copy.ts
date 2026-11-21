import type { QuestionAnswer, QuestionRequest } from './ask-model.ts';

export function questionTakeoverLabel(step: number, total: number) {
    if (total === 1) {
        return 'One question';
    }
    return step >= total ? 'Review' : `${step + 1} of ${total}`;
}

export function answerQuestionsLabel(request: QuestionRequest) {
    return request.questions.length === 1 ? 'Answer question' : 'Answer questions';
}

export function answerText(answer: QuestionAnswer) {
    return [...answer.labels, answer.text.trim()].filter(Boolean).join(', ');
}
