import type { AskQuestion, QuestionAnswer, QuestionRequest } from './ask-model.ts';

const recommendedSuffix = /\s*\(Recommended\)$/iu;

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
    return [...answer.labels.map(optionDisplayLabel), answer.text.trim()]
        .filter(Boolean)
        .join(', ');
}

export function optionDisplayLabel(label: string) {
    return label.replace(recommendedSuffix, '') || label;
}

export function typedAnswerLabel(question: AskQuestion) {
    return question.options.length > 0 ? 'Or type an answer' : 'Type an answer';
}
