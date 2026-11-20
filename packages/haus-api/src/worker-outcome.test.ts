import { expect, test } from 'bun:test';
import {
    type WorkerOutcome,
    type WorkerOutcomeInput,
    workerOutcomeOf,
    workerOutcomeSchema,
    workerStatusOf,
} from './worker-outcome.ts';

const pullRequestUrl = 'https://github.com/acme/app/pull/12';
const noPerson = { personId: null, personRefused: null };

function settle(overrides: Partial<WorkerOutcomeInput> & Pick<WorkerOutcomeInput, 'status'>) {
    return workerOutcomeOf({
        errorCode: null,
        messageId: 'msg_report',
        person: noPerson,
        result: null,
        ...overrides,
    });
}

function result(text: string, outcome: 'done' | 'needs-you' | 'failed' | null = null) {
    return { outcome, personHandle: null, pullRequestUrls: [pullRequestUrl], text };
}

test.each<[string, WorkerOutcome, WorkerOutcome]>([
    [
        'a finished result with no Haus-Outcome line reads done',
        settle({ result: result('Opened the fix.'), status: 'completed' }),
        {
            kind: 'report',
            report: {
                ask: null,
                messageId: 'msg_report',
                outcome: 'done',
                personId: null,
                personRefused: null,
                pullRequestUrls: [pullRequestUrl],
                source: 'provider',
                text: 'Opened the fix.',
            },
        },
    ],
    [
        'a Haus-Outcome needs-you asks with its text and names the person the Server accepted',
        settle({
            person: { personId: 'usr_zach', personRefused: null },
            result: result('Is the 2px shift intended?', 'needs-you'),
            status: 'completed',
        }),
        {
            kind: 'report',
            report: {
                ask: 'Is the 2px shift intended?',
                messageId: 'msg_report',
                outcome: 'needs-you',
                personId: 'usr_zach',
                personRefused: null,
                pullRequestUrls: [pullRequestUrl],
                source: 'provider',
                text: 'Is the 2px shift intended?',
            },
        },
    ],
    [
        'a refused person leaves the ask for the Agent and says who was refused',
        settle({
            person: { personId: null, personRefused: 'ghost' },
            result: result('Which key rotates?', 'needs-you'),
            status: 'completed',
        }),
        {
            kind: 'report',
            report: {
                ask: 'Which key rotates?',
                messageId: 'msg_report',
                outcome: 'needs-you',
                personId: null,
                personRefused: 'ghost',
                pullRequestUrls: [pullRequestUrl],
                source: 'provider',
                text: 'Which key rotates?',
            },
        },
    ],
    [
        'a Haus-Outcome failed reports failed and names nobody',
        settle({
            person: { personId: 'usr_zach', personRefused: null },
            result: result('The repo has no tests.', 'failed'),
            status: 'completed',
        }),
        {
            kind: 'report',
            report: {
                ask: null,
                messageId: 'msg_report',
                outcome: 'failed',
                personId: null,
                personRefused: null,
                pullRequestUrls: [pullRequestUrl],
                source: 'provider',
                text: 'The repo has no tests.',
            },
        },
    ],
    [
        'a provider question settles needs-you with no person',
        settle({
            person: { personId: 'usr_zach', personRefused: null },
            result: result('Which branch?'),
            status: 'pending_input',
        }),
        {
            kind: 'report',
            report: {
                ask: 'Which branch?',
                messageId: 'msg_report',
                outcome: 'needs-you',
                personId: null,
                personRefused: null,
                pullRequestUrls: [pullRequestUrl],
                source: 'provider',
                text: 'Which branch?',
            },
        },
    ],
    [
        'an error with result text reports failed',
        settle({ errorCode: 'boom', result: result('Build broke.'), status: 'failed' }),
        {
            kind: 'report',
            report: {
                ask: null,
                messageId: 'msg_report',
                outcome: 'failed',
                personId: null,
                personRefused: null,
                pullRequestUrls: [pullRequestUrl],
                source: 'provider',
                text: 'Build broke.',
            },
        },
    ],
    [
        'an error with no result text is a provider error nobody wrote',
        settle({ errorCode: 'boom', status: 'failed' }),
        { detail: 'boom', kind: 'failed', reason: 'provider-error' },
    ],
    [
        'a turn its carrier never journaled never reached the provider',
        settle({ errorCode: 'turn-not-journaled', status: 'failed' }),
        { detail: 'turn-not-journaled', kind: 'failed', reason: 'launch-refused' },
    ],
    [
        'a finished run with no result text has no report',
        settle({ result: result(''), status: 'completed' }),
        { detail: null, kind: 'failed', reason: 'no-report' },
    ],
    [
        'an expired run is a provider expiry',
        settle({ errorCode: 'gone', result: result('Partial.'), status: 'expired' }),
        { detail: 'gone', kind: 'failed', reason: 'provider-expired' },
    ],
    [
        'a run Haus cancelled is stopped',
        settle({ result: result('Halfway.'), status: 'cancelled' }),
        { kind: 'stopped' },
    ],
])('%s', (_name, outcome, expected) => {
    expect(outcome).toEqual(expected);
    expect(workerOutcomeSchema.parse(outcome)).toEqual(expected);
});

test('report text is clipped at 8000 characters', () => {
    const outcome = settle({ result: result('x'.repeat(9000)), status: 'completed' });
    expect(outcome.kind === 'report' ? outcome.report.text.length : 0).toBe(8000);
});

test.each<[string, Parameters<typeof workerStatusOf>[0], ReturnType<typeof workerStatusOf>]>([
    ['a queued turn reads queued', { outcome: null, status: 'queued' }, 'queued'],
    ['a running turn reads working', { outcome: null, status: 'running' }, 'working'],
    [
        'a needs-you report reads needs-you',
        { outcome: settle({ status: 'pending_input' }), status: 'pending_input' },
        'needs-you',
    ],
    ['a stop reads stopped', { outcome: { kind: 'stopped' }, status: 'cancelled' }, 'stopped'],
    [
        'a stop Haus settled while the provider still runs reads stopped',
        { outcome: { kind: 'stopped' }, status: 'running' },
        'stopped',
    ],
    [
        'a recorded failure reads failed',
        { outcome: settle({ status: 'expired' }), status: 'expired' },
        'failed',
    ],
])('%s', (_name, newest, status) => {
    expect(workerStatusOf(newest)).toBe(status);
});
