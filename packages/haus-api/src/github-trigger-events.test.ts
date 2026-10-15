import { describe, expect, test } from 'bun:test';
import {
    agentTriggerCreateInputSchema,
    agentTriggerCreateResultSchema,
    agentTriggerSchema,
} from './agent-triggers.ts';
import { githubInstallationSchema } from './github.ts';
import {
    githubTriggerEventNameSchema,
    githubTriggerEventPermission,
    githubTriggerEventsSchema,
    githubTriggerRepositoriesSchema,
} from './github-trigger-events.ts';
import {
    triggerCreateInputSchema,
    triggerCreateResultSchema,
    triggerSchema,
    triggerSecretResultSchema,
    triggerUpdateInputSchema,
} from './triggers.ts';

const githubTrigger = {
    anchorChatId: 'cht_dm',
    anchorMessageId: null,
    createdAt: '2026-10-11T12:00:00.000Z',
    createdByHandle: 'zach',
    createdByUserId: 'usr_zach',
    disabledAt: null,
    fireCount: 0,
    github: {
        events: [{ actions: ['completed'], conclusions: ['failure'], event: 'workflow_run' }],
        installationId: 'ghi_0123456789abcdef',
        installationLogin: 'acme',
        problem: null,
        problemSince: null,
        repositories: { names: ['acme/api'], scope: 'repositories' },
        suppressedCount: 0,
    },
    id: 'trg_gh',
    instruction: null,
    kind: 'github',
    lastFiredAt: null,
    ownerAgentId: 'agt_cove',
    ownerHandle: 'cove',
    status: 'armed',
    title: 'CI failed',
    updatedAt: '2026-10-11T12:00:00.000Z',
    version: 1,
};

const config = {
    events: [{ event: 'workflow_run' }],
    installationId: 'ghi_0123456789abcdef',
    repositories: { scope: 'installation' },
};
const agentConfig = {
    account: 'acme',
    events: [{ event: 'workflow_run' }],
    repositories: { scope: 'installation' },
};

describe('github trigger events', () => {
    test('fills each event default: actions, and authors that default to collaborators', () => {
        expect(
            githubTriggerEventsSchema.parse([
                { event: 'workflow_run' },
                { event: 'pull_request' },
                { event: 'push' },
                { event: 'release' },
            ])
        ).toEqual([
            { actions: ['completed'], event: 'workflow_run' },
            { actions: ['opened'], authors: 'collaborators', event: 'pull_request' },
            { event: 'push' },
            { actions: ['published'], event: 'release' },
        ]);
    });

    test('accepts alternative groups and refuses empty, excessive, foreign, or unknown entries', () => {
        expect(() => githubTriggerEventsSchema.parse([])).toThrow();
        expect(
            githubTriggerEventsSchema.parse([
                { event: 'push', branches: ['main'] },
                { event: 'push', branches: ['release/*'] },
            ])
        ).toHaveLength(2);
        expect(() =>
            githubTriggerEventsSchema.parse(Array.from({ length: 11 }, () => ({ event: 'push' })))
        ).toThrow();
        expect(() =>
            githubTriggerEventsSchema.parse([{ event: 'push', labels: ['bug'] }])
        ).toThrow();
        expect(() => githubTriggerEventsSchema.parse([{ event: 'issue_comment' }])).toThrow();
        expect(() =>
            githubTriggerEventsSchema.parse([
                { branches: Array.from({ length: 21 }, (_, index) => `b${index}`), event: 'push' },
            ])
        ).toThrow();
        expect(() =>
            githubTriggerEventsSchema.parse([{ actions: ['merged'], event: 'pull_request' }])
        ).toThrow();
    });

    test('every event names the App permission it needs', () => {
        for (const event of githubTriggerEventNameSchema.options) {
            expect(githubTriggerEventPermission[event]).toBeString();
        }
        expect(githubTriggerEventPermission.workflow_run).toBe('actions');
        expect(githubTriggerEventPermission.release).toBe('contents');
    });

    test('a repository scope names owner/name repositories, each once, at most 50', () => {
        expect(githubTriggerRepositoriesSchema.parse({ scope: 'installation' })).toEqual({
            scope: 'installation',
        });
        expect(() =>
            githubTriggerRepositoriesSchema.parse({ names: [], scope: 'repositories' })
        ).toThrow();
        expect(() =>
            githubTriggerRepositoriesSchema.parse({ names: ['api'], scope: 'repositories' })
        ).toThrow(/owner\/name/u);
        expect(() =>
            githubTriggerRepositoriesSchema.parse({
                names: ['acme/api', 'Acme/API'],
                scope: 'repositories',
            })
        ).toThrow(/at most once/u);
        expect(() =>
            githubTriggerRepositoriesSchema.parse({
                names: Array.from({ length: 51 }, (_, index) => `acme/r${index}`),
                scope: 'repositories',
            })
        ).toThrow();
    });
});

describe('github trigger wire shape', () => {
    test('a github Trigger carries its configuration and never a URL or secret', () => {
        expect(triggerSchema.parse(githubTrigger)).toMatchObject({
            github: { installationLogin: 'acme' },
            kind: 'github',
        });
        expect(() => triggerSchema.parse({ ...githubTrigger, url: 'https://x' })).toThrow();
        expect(() =>
            triggerSecretResultSchema.parse({
                curl: 'curl',
                secret: 'grtt_x',
                trigger: githubTrigger,
                url: 'https://x',
            })
        ).toThrow();
        expect(triggerCreateResultSchema.parse({ trigger: githubTrigger })).toEqual({
            trigger: triggerSchema.parse(githubTrigger),
        });
        expect(agentTriggerSchema.parse({ ...githubTrigger, anchorTarget: '@zach' }).kind).toBe(
            'github'
        );
        expect(
            agentTriggerCreateResultSchema.parse({
                trigger: { ...githubTrigger, anchorTarget: '@zach' },
            })
        ).toHaveProperty('trigger');
    });

    test('create input is a union on kind; github needs its configuration', () => {
        expect(
            triggerCreateInputSchema.parse({
                agentId: 'agt_cove',
                github: config,
                kind: 'github',
                serverId: 'srv_one',
                title: 'CI failed',
            })
        ).toMatchObject({ github: { events: [{ actions: ['completed'] }] }, kind: 'github' });
        expect(() =>
            triggerCreateInputSchema.parse({
                agentId: 'agt_cove',
                kind: 'github',
                serverId: 'srv_one',
                title: 'CI failed',
            })
        ).toThrow();
        expect(() =>
            triggerCreateInputSchema.parse({
                agentId: 'agt_cove',
                github: config,
                kind: 'webhook',
                serverId: 'srv_one',
                title: 'Deploy',
            })
        ).toThrow();
        expect(() =>
            agentTriggerCreateInputSchema.parse({
                github: config,
                kind: 'github',
                messageId: 'msg_anchor',
                title: 'CI failed',
            })
        ).toThrow();
        expect(
            agentTriggerCreateInputSchema.parse({
                github: agentConfig,
                kind: 'github',
                messageId: 'msg_anchor',
                title: 'CI failed',
            })
        ).toMatchObject({ kind: 'github' });
        expect(() =>
            agentTriggerCreateInputSchema.parse({
                github: agentConfig,
                messageId: 'msg_anchor',
                title: 'CI failed',
            })
        ).toThrow();
        expect(
            triggerUpdateInputSchema.parse({ github: config, serverId: 's', triggerId: 't' })
        ).toHaveProperty('github');
    });

    test('an installation names both the Haus row and GitHub numeric ids', () => {
        const installation = githubInstallationSchema.parse({
            accessibleRepositoryCount: 3,
            accessSyncedAt: null,
            account: { id: 9, login: 'acme', type: 'Organization' },
            connectionId: 'mcp_0123456789abcdef',
            createdAt: '2026-10-11T12:00:00.000Z',
            githubInstallationId: 4242,
            id: 'ghi_0123456789abcdef',
            permissions: { actions: 'write', metadata: 'read' },
            removedAt: null,
            repositorySelection: 'selected',
            status: 'active',
            updatedAt: '2026-10-11T12:00:00.000Z',
        });
        expect(installation.githubInstallationId).toBe(4242);
        expect(() =>
            githubInstallationSchema.parse({ ...installation, status: 'deleted' })
        ).toThrow();
    });
});
