export interface AskOption {
    description?: string;
    label: string;
}

export interface AskQuestion {
    header: string;
    multiSelect: boolean;
    options: readonly AskOption[];
    question: string;
}

export interface QuestionAnswer {
    labels: readonly string[];
    text: string;
}

export interface QuestionRequest {
    questions: readonly AskQuestion[];
}

export function emptyAnswers(request: QuestionRequest) {
    const empty: QuestionAnswer = { labels: [], text: '' };
    return request.questions.map(() => empty);
}

export function isAnswered(answer: QuestionAnswer | undefined) {
    return answer !== undefined && (answer.labels.length > 0 || answer.text.trim() !== '');
}
