import { expect, test } from 'bun:test';
import type { AgentApiRequest } from '../agent-api-client.ts';
import { runTriggerCreate, runTriggerList, runTriggerShow } from './agent-trigger.ts';

import { args, githubTrigger, installations, requester } from './agent-trigger-test-fixtures.ts';

test('lists a GitHub Trigger with its scope, events, and suppressed count, no URL', async () => {
    const written: string[] = [];
    await runTriggerList(args({}), {
        client: requester(() => ({ triggers: [githubTrigger] })),
        write: (text) => written.push(text),
    });

    expect(written.join('')).toBe(
        [
            'trg_gh [github · armed] "CI failed" — never fired, anchored in #general — GitHub acme',
            '  repositories: acme/api',
            '  events: workflow_run completed branches=main conclusions=failure',
            '  suppressed over the rate limit: 2',
            '',
        ].join('\n')
    );
});

test('show marks a degraded Trigger and names the human fix', async () => {
    const written: string[] = [];
    const degraded = {
        ...githubTrigger,
        github: {
            ...githubTrigger.github,
            problem: 'repositories_unavailable',
            problemSince: '2026-10-11T11:00:00.000Z',
            repositories: { scope: 'installation' },
        },
    };
    await runTriggerShow(args({ '--id': 'trg_gh' }), {
        client: requester(() => ({ trigger: degraded })),
        write: (text) => written.push(text),
    });
    const output = written.join('');

    expect(output).toContain('[github · armed · degraded: repositories unavailable]');
    expect(output).toContain('repositories: every repository you can reach in acme');
    expect(output).toContain('Not firing. A selected repository left the installation');
});

test('creates a GitHub Trigger on the installation that owns the repository', async () => {
    const calls: { input: AgentApiRequest; route: string }[] = [];
    const written: string[] = [];
    await runTriggerCreate(
        args(
            {
                '--instruction': 'Find the failing step.',
                '--kind': 'github',
                '--message-id': 'deadbeef',
                '--title': 'CI failed',
            },
            {
                '--branch': ['main'],
                '--conclusion': ['failure,timed_out'],
                '--event': ['workflow_run', 'pull_request'],
                '--repo': ['acme/api', 'acme/web'],
            }
        ),
        {
            client: requester((route, input) => {
                calls.push({ input, route });
                return route === '/api/agent/github/installations'
                    ? installations
                    : { trigger: githubTrigger };
            }),
            write: (text) => written.push(text),
        }
    );

    expect(calls.map((call) => call.route)).toEqual([
        '/api/agent/github/installations',
        '/api/agent/triggers',
    ]);
    expect(calls[1]?.input.body).toEqual({
        github: {
            events: [
                {
                    actions: ['completed'],
                    branches: ['main'],
                    conclusions: ['failure', 'timed_out'],
                    event: 'workflow_run',
                },
                {
                    actions: ['opened'],
                    authors: 'collaborators',
                    baseBranches: ['main'],
                    event: 'pull_request',
                },
            ],
            installationId: 'ghi_0123456789abcdef',
            repositories: { names: ['acme/api', 'acme/web'], scope: 'repositories' },
        },
        instruction: 'Find the failing step.',
        kind: 'github',
        messageId: 'deadbeef',
        title: 'CI failed',
    });
    const output = written.join('');
    expect(output).toContain('Created. trg_gh [github · armed]');
    expect(output).toContain('No URL or secret');
    expect(output).not.toContain('Secret:');
});

test('--org watches the whole installation and --action lands on the events that take it', async () => {
    const bodies: unknown[] = [];
    await runTriggerCreate(
        args(
            { '--kind': 'github', '--message-id': 'deadbeef', '--org': 'acme', '--title': 'PRs' },
            {
                '--action': ['opened', 'ready_for_review', 'published'],
                '--event': ['pull_request', 'release', 'push'],
            }
        ),
        {
            client: requester((route, input) => {
                bodies.push(input.body);
                return route === '/api/agent/github/installations'
                    ? installations
                    : { trigger: githubTrigger };
            }),
            write: () => undefined,
        }
    );

    expect(bodies[1]).toMatchObject({
        github: {
            events: [
                { actions: ['opened', 'ready_for_review'], event: 'pull_request' },
                { actions: ['published'], event: 'release' },
                { event: 'push' },
            ],
            repositories: { scope: 'installation' },
        },
    });
});

test.each([
    [
        { '--event': ['push'], '--org': ['acme'], '--conclusion': ['failure'] },
        '--conclusion applies to none of the listed events (push).',
    ],
    [
        { '--event': ['workflow_run'], '--org': ['acme'], '--action': ['opened'] },
        '--action opened fits none of the listed events (workflow_run).',
    ],
    [
        { '--event': ['issue_comment'], '--org': ['acme'] },
        '--event issue_comment is not a GitHub Trigger event.',
    ],
    [{ '--org': ['acme'] }, 'Provide --event with a GitHub event to listen to.'],
    [{ '--event': ['push'] }, 'Provide --repo <owner/name> or --org <login>.'],
    [
        { '--event': ['push'], '--repo': ['acme/api', 'other/web'] },
        'One Trigger watches one GitHub account.',
    ],
    [
        { '--event': ['push'], '--org': ['acme'], '--repo': ['acme/api'] },
        'Use --repo or --org, not both.',
    ],
] as [
    Record<string, string[]>,
    string,
][])('refuses invalid github flags before creating: %o', async (lists, message) => {
    const routes: string[] = [];
    await expect(
        runTriggerCreate(
            args({ '--kind': 'github', '--message-id': 'deadbeef', '--title': 'CI failed' }, lists),
            {
                client: requester((route) => {
                    routes.push(route);
                    return installations;
                }),
                write: () => undefined,
            }
        )
    ).rejects.toThrow(message);
    expect(routes).not.toContain('/api/agent/triggers');
});

test('names the missing installation and who can install the App', async () => {
    await expect(
        runTriggerCreate(
            args(
                { '--kind': 'github', '--message-id': 'deadbeef', '--title': 'CI failed' },
                { '--event': ['push'], '--repo': ['globex/api'] }
            ),
            { client: requester(() => installations), write: () => undefined }
        )
    ).rejects.toMatchObject({
        code: 'INVALID_TARGET',
        message: 'No Haus GitHub installation you can use covers globex.',
        options: { nextAction: expect.stringContaining('install the Haus GitHub App') },
    });
});

test('a webhook create refuses github-only flags', async () => {
    await expect(
        runTriggerCreate(
            args({ '--message-id': 'deadbeef', '--repo': 'acme/api', '--title': 'deploy' }),
            { client: requester(() => ({})), write: () => undefined }
        )
    ).rejects.toThrow('--repo needs --kind github.');
});
