import { expect, test } from 'bun:test';
import type { AgentApiRequest } from '../agent-api-client.ts';
import { runTriggerCreate } from './agent-trigger-actions.ts';
import { args, githubTrigger, requester } from './agent-trigger-test-fixtures.ts';

test('agents can create alternative groups and replace them with update', async () => {
    const { runTriggerUpdate } = await import('./agent-trigger-edit.ts');
    const events = [
        {
            event: 'workflow_run',
            workflows: ['**/deploy.yml'],
            conclusions: ['failure', 'cancelled'],
        },
        {
            event: 'workflow_run',
            workflows: ['**/quality.yml'],
            conclusions: ['failure'],
            repositoriesIgnore: ['acme/archive-*'],
        },
    ];
    const calls: { route: string; input: AgentApiRequest }[] = [];
    const client = requester((route, input) => {
        calls.push({ route, input });
        return { trigger: githubTrigger };
    });
    await runTriggerCreate(
        args({
            '--kind': 'github',
            '--message-id': 'msg_test',
            '--title': 'Watch failures',
            '--org': 'acme',
            '--events-json': JSON.stringify(events),
        }),
        { client, write: () => undefined }
    );
    expect(calls.at(-1)?.input.body).toMatchObject({ github: { events } });
    await runTriggerUpdate(
        args({ '--id': 'trg_gh', '--org': 'acme', '--events-json': JSON.stringify(events) }),
        { client, write: () => undefined }
    );
    expect(calls.at(-1)).toMatchObject({
        route: '/api/agent/triggers/trg_gh',
        input: { method: 'PATCH', body: { github: { events } } },
    });
    await expect(
        runTriggerCreate(
            args({
                '--kind': 'github',
                '--message-id': 'msg_test',
                '--title': 'Mixed',
                '--org': 'acme',
                '--events-json': JSON.stringify(events),
                '--branch': 'main',
            }),
            { client, write: () => undefined }
        )
    ).rejects.toThrow('--events-json replaces');
});

test('--events-json names the group, the unknown key, and the keys its event takes', async () => {
    const create = (events: unknown) =>
        runTriggerCreate(
            args({
                '--events-json': JSON.stringify(events),
                '--kind': 'github',
                '--message-id': 'msg_test',
                '--org': 'acme',
                '--title': 'CI',
            }),
            {
                client: requester(() => {
                    throw new Error('Should not send');
                }),
                write: () => undefined,
            }
        );
    await expect(
        create([{ event: 'workflow_run' }, { event: 'push', excludeRepos: ['acme/old'] }])
    ).rejects.toMatchObject({
        message: '--events-json group 2 (push) does not take excludeRepos.',
        options: { nextAction: expect.stringContaining('repositoriesIgnore') },
    });
    await expect(create([{ event: 'issue_comment' }])).rejects.toMatchObject({
        message: '--events-json group 1 (issue_comment) is not a GitHub Trigger event.',
    });
});

test('exclude flags and source event filters reach the typed configuration', async () => {
    let body: unknown;
    await runTriggerCreate(
        args({
            '--kind': 'github',
            '--message-id': 'msg_test',
            '--title': 'CI',
            '--org': 'acme',
            '--event': 'workflow_run',
            '--branch': '@default',
            '--exclude-repo': 'acme/archive-*',
            '--exclude-workflow': '**/experimental.yml',
            '--exclude-actor': 'dependabot[bot]',
            '--workflow-event': 'push',
        }),
        {
            client: requester((_route, input) => {
                body = input.body;
                return { trigger: githubTrigger };
            }),
            write: () => undefined,
        }
    );
    expect(body).toMatchObject({
        github: {
            events: [
                {
                    event: 'workflow_run',
                    branches: ['@default'],
                    repositoriesIgnore: ['acme/archive-*'],
                    workflowsIgnore: ['**/experimental.yml'],
                    actorsIgnore: ['dependabot[bot]'],
                    workflowEvents: ['push'],
                },
            ],
        },
    });
});

test('new controls are registered for the real CLI parser', async () => {
    const { TRIGGER_SUBCOMMANDS } = await import('./agent-trigger.ts');
    const { parseArgs } = await import('../parse.ts');
    for (const name of ['create', 'update']) {
        const sub = TRIGGER_SUBCOMMANDS.find((entry) => entry.name === name)!;
        const parsed = parseArgs({ ...sub, section: 'trigger' }, [
            '--exclude-repo',
            'acme/archive-*',
            '--events-json',
            '[{"event":"push"}]',
        ]);
        expect(parsed.values['--exclude-repo']).toBe('acme/archive-*');
    }
    expect(
        TRIGGER_SUBCOMMANDS.find((entry) => entry.name === 'preview')?.flags.map(
            (flag) => flag.name
        )
    ).toContain('--payload-file');
});

test('preview sends the raw sample to the Server and reports selection without firing', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { runTriggerPreview } = await import('./agent-trigger-edit.ts');
    const directory = await mkdtemp(join(tmpdir(), 'haus-trigger-preview-'));
    try {
        const path = join(directory, 'payload.json');
        const payload = { repository: { id: 7001 }, action: 'completed' };
        await writeFile(path, JSON.stringify(payload));
        const written: string[] = [];
        const calls: { route: string; input: AgentApiRequest }[] = [];
        await runTriggerPreview(
            args({ '--id': 'trg_gh', '--event': 'workflow_run', '--payload-file': path }),
            {
                client: requester((route, input) => {
                    calls.push({ route, input });
                    return {
                        groups: [{ index: 0, matches: true }],
                        matches: true,
                        repositoryInScope: true,
                    };
                }),
                write: (text) => written.push(text),
            }
        );
        expect(calls).toEqual([
            {
                route: '/api/agent/triggers/trg_gh/preview',
                input: { method: 'POST', body: { event: 'workflow_run', payload } },
            },
        ]);
        expect(written.join('')).toContain('no fire recorded');
        await writeFile(path, JSON.stringify({ large: 'x'.repeat(60_001) }));
        await expect(
            runTriggerPreview(
                args({ '--id': 'trg_gh', '--event': 'workflow_run', '--payload-file': path }),
                {
                    client: requester(() => {
                        throw new Error('Should not send');
                    }),
                    write: () => undefined,
                }
            )
        ).rejects.toThrow('under 60,000 bytes');
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
