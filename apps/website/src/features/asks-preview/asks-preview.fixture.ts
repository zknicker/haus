import type { QuestionAnswer, QuestionRequest } from '../asks/ask-model.ts';
import type { PreviewItem } from './asks-preview-state.ts';

export const workerTitle = 'Move the tasks table';

export const workerName = 'Worker on MacBook';

export const authors = {
    captain: { avatarUrl: null, name: 'Cove' },
    person: { avatarUrl: null, name: 'Zach' },
    worker: { avatarUrl: null, name: workerName },
} as const;

export const migrationQuestions = {
    questions: [
        {
            header: 'Database',
            multiSelect: false,
            options: [
                { description: 'Matches the Server store', label: 'Postgres' },
                { description: 'One local file, no service to run', label: 'SQLite' },
            ],
            question: 'Which database should the tasks table move to?',
        },
        {
            header: 'Old table',
            multiSelect: false,
            options: [
                { label: 'Keep the old table' },
                { label: 'Drop it after the copy' },
                { label: 'Archive it to Drive' },
            ],
            question: 'What should happen to the old table?',
        },
        {
            header: 'Notify',
            multiSelect: true,
            options: [{ label: '#product' }, { label: 'Priya' }, { label: 'Maya' }],
            question: 'Who should hear when it lands?',
        },
    ],
} as const satisfies QuestionRequest;

export const reviewAnswers: readonly QuestionAnswer[] = [
    { labels: ['Postgres'], text: '' },
    { labels: [], text: '' },
    { labels: ['#product', 'Priya'], text: '' },
];

export const workerOpening: readonly PreviewItem[] = [
    {
        author: 'captain',
        body: {
            kind: 'text',
            text: 'Move the tasks table off the legacy store. Keep the copy reversible, and tell the people who use it when it lands.',
        },
        id: 'brief',
        kind: 'message',
        minute: 2,
    },
    {
        author: 'worker',
        body: { kind: 'text', text: 'Before I migrate, three questions.' },
        id: 'worker-asks',
        kind: 'message',
        minute: 4,
    },
];

export function previewTime(minute: number) {
    return `2026-11-21T15:${String(minute).padStart(2, '0')}:00.000Z`;
}
