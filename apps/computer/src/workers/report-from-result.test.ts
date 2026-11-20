import { expect, test } from 'bun:test';
import type { WorkerObservedResult } from '@haus/api';
import { observedResultOf } from './report-from-result.ts';

const pullRequest = 'https://github.com/acme/app/pull/412';

test.each<{ expected: WorkerObservedResult; finalText: string; name: string }>([
    {
        name: 'a Cursor result ending with its pull request and done',
        finalText: `Fixed the race in agent-delivery.test.ts by awaiting the socket close.\n\n${pullRequest}\n\nHaus-Outcome: done`,
        expected: {
            outcome: 'done',
            personHandle: null,
            pullRequestUrls: [pullRequest],
            text: `Fixed the race in agent-delivery.test.ts by awaiting the socket close.\n\n${pullRequest}`,
        },
    },
    {
        name: 'a Claude result asking a person',
        finalText:
            'The iPad baseline moves 2px with the fix. Is that intended?\n\nHaus-Outcome: needs-you\nHaus-Person: @zach\n',
        expected: {
            outcome: 'needs-you',
            personHandle: 'zach',
            pullRequestUrls: [],
            text: 'The iPad baseline moves 2px with the fix. Is that intended?',
        },
    },
    {
        name: 'a result with no Haus line',
        finalText: 'Trimmed the settings copy.',
        expected: {
            outcome: null,
            personHandle: null,
            pullRequestUrls: [],
            text: 'Trimmed the settings copy.',
        },
    },
    {
        name: 'a failed result',
        finalText: 'I could not reproduce the failure on main.\r\nHaus-Outcome: failed',
        expected: {
            outcome: 'failed',
            personHandle: null,
            pullRequestUrls: [],
            text: 'I could not reproduce the failure on main.',
        },
    },
    {
        name: 'Haus lines in either order and any case',
        finalText: 'Opened the draft.\nhaus-person: @ana\nHAUS-OUTCOME: Needs-You',
        expected: {
            outcome: 'needs-you',
            personHandle: 'ana',
            pullRequestUrls: [],
            text: 'Opened the draft.',
        },
    },
    {
        name: 'an outcome Haus does not know stays in the text',
        finalText: 'Shipped it.\nHaus-Outcome: shipped',
        expected: {
            outcome: null,
            personHandle: null,
            pullRequestUrls: [],
            text: 'Shipped it.\nHaus-Outcome: shipped',
        },
    },
    {
        name: 'a Haus line before more text is not a trailer',
        finalText: 'Haus-Outcome: done\nThen I kept going.',
        expected: {
            outcome: null,
            personHandle: null,
            pullRequestUrls: [],
            text: 'Haus-Outcome: done\nThen I kept going.',
        },
    },
    {
        name: 'links that are not GitHub pull requests',
        finalText:
            'See https://gitlab.com/acme/app/-/merge_requests/3 and https://github.com/acme/app/issues/9.',
        expected: {
            outcome: null,
            personHandle: null,
            pullRequestUrls: [],
            text: 'See https://gitlab.com/acme/app/-/merge_requests/3 and https://github.com/acme/app/issues/9.',
        },
    },
    {
        name: 'pull requests named twice, once with a trailing path',
        finalText: `Opened ${pullRequest}. Review the diff at ${pullRequest}/files.\nHaus-Outcome: done`,
        expected: {
            outcome: 'done',
            personHandle: null,
            pullRequestUrls: [pullRequest],
            text: `Opened ${pullRequest}. Review the diff at ${pullRequest}/files.`,
        },
    },
])('$name', ({ finalText, expected }) => {
    expect(observedResultOf(finalText)).toEqual(expected);
});

test('a pull request the provider reported on a branch joins the ones the text names', () => {
    const branches = [
        { branch: 'fix/race', pullRequestUrl: pullRequest, repository: 'acme/app' },
        {
            branch: 'fix/copy',
            pullRequestUrl: 'https://github.com/acme/app/pull/413',
            repository: 'acme/app',
        },
        { branch: 'wip', pullRequestUrl: null, repository: 'acme/app' },
    ];
    expect(observedResultOf(`Opened ${pullRequest}.`, branches).pullRequestUrls).toEqual([
        pullRequest,
        'https://github.com/acme/app/pull/413',
    ]);
});

test('the text is clipped to the observation limit after its Haus lines are read', () => {
    const result = observedResultOf(`${'x'.repeat(70_000)}\nHaus-Outcome: done`);
    expect(result.outcome).toBe('done');
    expect(result.text).toBe('x'.repeat(65_536));
});
