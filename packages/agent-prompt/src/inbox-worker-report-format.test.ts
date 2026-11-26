import { expect, test } from 'bun:test';
import { type WorkerReportAttention, workerQuestionsText } from '@haus/api';
import { formatWorkerReport } from './inbox-worker-report-format.ts';

const questions = [
    {
        header: null,
        multiSelect: false,
        options: [
            { description: null, label: 'Postgres' },
            { description: null, label: 'SQLite' },
        ],
        question: 'Which database?',
    },
];

function attention(person: WorkerReportAttention['person']) {
    return {
        citedFiles: [],
        outcome: {
            kind: 'report',
            report: {
                ask: 'Which database?',
                messageId: 'msg_1',
                outcome: 'needs-you',
                personId: person?.id ?? null,
                personRefused: null,
                pullRequestUrls: [],
                questions,
                source: 'worker',
                text: workerQuestionsText(questions),
            },
        },
        person,
        place: { kind: 'cursor' },
        pullRequests: [],
        taskShortId: 'k3mq7xta',
        title: 'Pick a database',
        turnId: 'wkt_1',
        turnNumber: 1,
        workerId: 'wkr_1',
    } satisfies WorkerReportAttention;
}

test('a Worker question for the Agent lists the questions once and says they are its to answer', () => {
    expect(formatWorkerReport(attention(null))).toBe(
        [
            '[worker report · k3mq7xta · needs-you · Worker on cursor (wkr_1) · turn 1]',
            'Which database?',
            '  │ - Postgres',
            '  │ - SQLite',
            'The Worker asked these questions, and they are for you. Answer with a numbered list in one follow-up.',
            'The report is already posted in k3mq7xta. Post only what it does not say. Answer the Worker with haus worker send --worker wkr_1, or start a narrower Worker.',
        ].join('\n')
    );
});

test('a Worker question for a person says who was asked', () => {
    expect(formatWorkerReport(attention({ handle: 'zach', id: 'usr_1' }))).toContain(
        'Asked @zach in the Task. Their answer reaches the Worker as its next turn.'
    );
});
