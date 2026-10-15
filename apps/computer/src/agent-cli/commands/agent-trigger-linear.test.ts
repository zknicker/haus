import { expect, test } from 'bun:test';
import type { AgentApiRequest } from '../agent-api-client.ts';
import { runTriggerCreate } from './agent-trigger-actions.ts';
import { runTriggerPreview, runTriggerUpdate } from './agent-trigger-edit.ts';

import { args, githubTrigger, linearTrigger, requester } from './agent-trigger-test-fixtures.ts';

const workspace = {
    connectionId: 'mcp_linear',
    hasIdentity: false,
    id: 'lnw_0123456789abcdef',
    name: 'Acme',
    status: 'active',
    teams: [{ id: 'team-des', key: 'DES', name: 'Design' }],
    urlKey: 'acme',
};
const workspaces = { workspaces: [workspace] };

function recording(respond: (route: string) => unknown = () => ({ trigger: linearTrigger })) {
    const calls: { input: AgentApiRequest; route: string }[] = [];
    const client = requester((route, input) => {
        calls.push({ input, route });
        return route === '/api/agent/linear/workspaces' ? workspaces : respond(route);
    });
    return { calls, client };
}

const base = { '--kind': 'linear', '--message-id': 'msg_test', '--title': 'Design needs changes' };

test('flags build one group and resolve the workspace to its connection', async () => {
    const { calls, client } = recording();
    const written: string[] = [];
    await runTriggerCreate(
        args(
            { ...base, '--workspace': 'acme', '--event': 'issue' },
            {
                '--action': ['update'],
                '--delegate': ['@self'],
                '--state-from': ['Design Review'],
                '--state-to': ['Changes Requested'],
            }
        ),
        { client, write: (text) => written.push(text) }
    );
    expect(calls.at(-1)).toEqual({
        input: {
            body: {
                kind: 'linear',
                linear: {
                    connectionId: 'mcp_linear',
                    groups: [
                        {
                            actions: ['update'],
                            delegates: ['@self'],
                            event: 'issue',
                            stateFrom: ['Design Review'],
                            stateTo: ['Changes Requested'],
                        },
                    ],
                },
                messageId: 'msg_test',
                title: 'Design needs changes',
            },
            method: 'POST',
        },
        route: '/api/agent/triggers',
    });
    expect(written.join('')).toContain('No URL or secret: Linear deliveries reach you directly.');
});

test('enumerated flags split on commas and the only workspace needs no --workspace', async () => {
    const { calls, client } = recording();
    await runTriggerCreate(
        args({ ...base, '--event': 'issue' }, { '--action': ['create,update'], '--team': ['DES'] }),
        { client, write: () => undefined }
    );
    expect(calls.at(-1)?.input.body).toMatchObject({
        linear: { groups: [{ actions: ['create', 'update'], event: 'issue', teams: ['DES'] }] },
    });
});

test('--groups-json supplies every group and refuses mixed filter flags', async () => {
    const groups = [
        { actions: ['update'], delegates: ['@self'], event: 'issue', stateTo: ['Approved'] },
        { delegates: ['@self'], event: 'comment' },
    ];
    const { calls, client } = recording();
    await runTriggerCreate(args({ ...base, '--groups-json': JSON.stringify(groups) }), {
        client,
        write: () => undefined,
    });
    expect(calls.at(-1)?.input.body).toMatchObject({
        linear: { groups: [groups[0], { ...groups[1], actions: ['create'] }] },
    });
    await expect(
        runTriggerCreate(
            args({ ...base, '--groups-json': JSON.stringify(groups), '--team': 'DES' }),
            { client, write: () => undefined }
        )
    ).rejects.toThrow('--groups-json replaces --team.');
});

test.each([
    [{ '--event': 'comment', '--state-to': 'Approved' }, '--state-to does not apply to comment'],
    [{ '--event': 'issue_label' }, 'issue_label is not a Linear Trigger event.'],
    [{ '--event': 'issue', '--delegate': 'juniper' }, '--delegate'],
    [{ '--event': 'issue', '--repo': 'acme/api' }, '--repo needs --kind github.'],
    [{}, 'Provide --event'],
] as [
    Record<string, string>,
    string,
][])('refuses invalid linear flags before creating: %o', async (values, message) => {
    const { calls, client } = recording();
    await expect(
        runTriggerCreate(args({ ...base, ...values }), { client, write: () => undefined })
    ).rejects.toThrow(message);
    expect(calls.map((call) => call.route)).not.toContain('/api/agent/triggers');
});

test('a webhook create refuses linear-only flags and names the kind', async () => {
    await expect(
        runTriggerCreate(
            args({ '--message-id': 'msg_test', '--state-to': 'Approved', '--title': 'x' }),
            { client: requester(() => ({})), write: () => undefined }
        )
    ).rejects.toThrow('--state-to needs --kind linear.');
});

test('an unknown or inactive workspace is refused with the keys you can use', async () => {
    const { client } = recording();
    await expect(
        runTriggerCreate(args({ ...base, '--event': 'issue', '--workspace': 'globex' }), {
            client,
            write: () => undefined,
        })
    ).rejects.toMatchObject({
        code: 'INVALID_TARGET',
        options: { nextAction: 'You can use: acme.' },
    });
    const inactive = requester(() => ({
        workspaces: [{ ...workspace, status: 'refresh_required' }],
    }));
    await expect(
        runTriggerCreate(args({ ...base, '--event': 'issue' }), {
            client: inactive,
            write: () => undefined,
        })
    ).rejects.toThrow('The Acme Linear workspace is refresh required.');
});

test('update reads the trigger kind, then replaces the Linear groups', async () => {
    const { calls, client } = recording();
    await runTriggerUpdate(
        args({ '--event': 'issue', '--id': 'trg_ln' }, { '--state-to': ['Changes Requested'] }),
        { client, write: () => undefined }
    );
    expect(calls.map((call) => `${call.input.method} ${call.route}`)).toEqual([
        'GET /api/agent/triggers/trg_ln',
        'GET /api/agent/linear/workspaces',
        'PATCH /api/agent/triggers/trg_ln',
    ]);
    expect(calls.at(-1)?.input.body).toEqual({
        linear: {
            connectionId: 'mcp_linear',
            groups: [{ actions: ['create'], event: 'issue', stateTo: ['Changes Requested'] }],
        },
    });
    const github = recording(() => ({ trigger: githubTrigger }));
    await expect(
        runTriggerUpdate(args({ '--id': 'trg_gh', '--state-to': 'Approved' }), {
            client: github.client,
            write: () => undefined,
        })
    ).rejects.toThrow('--state-to does not apply to a github trigger.');
});

test('preview without --event sends the raw Linear body', async () => {
    const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const directory = await mkdtemp(join(tmpdir(), 'haus-linear-preview-'));
    try {
        const path = join(directory, 'issue-update.json');
        const payload = { action: 'update', type: 'Issue' };
        await writeFile(path, JSON.stringify(payload));
        const { calls, client } = recording(() => ({
            groups: [0],
            matched: false,
            reason: 'own_change',
        }));
        const written: string[] = [];
        await runTriggerPreview(args({ '--id': 'trg_ln', '--payload-file': path }), {
            client,
            write: (text) => written.push(text),
        });
        expect(calls).toEqual([
            {
                input: { body: { payload }, method: 'POST' },
                route: '/api/agent/triggers/trg_ln/preview',
            },
        ]);
        expect(written.join('')).toContain('"reason": "own_change"');
        expect(written.join('')).toContain('no fire recorded');
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
});
