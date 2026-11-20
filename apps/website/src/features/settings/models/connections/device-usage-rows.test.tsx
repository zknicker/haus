import { expect, test } from 'bun:test';
import type { AgentLoop, ComputerUsage } from '@haus/api';
import { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../../../lib/haus-server.tsx';
import { renderWithTrpc } from '../../../../test-support/trpc-test-provider.tsx';
import { computerWith, usageFixture } from '../../../usage/usage-fixtures.ts';
import { testConnection } from './model-connection.fixture.ts';
import { ModelConnectionsGroup } from './model-connections-group.tsx';

const serverId = 'srv_1';
const studio = {
    architecture: 'arm64',
    id: 'cmp_studio',
    name: 'Studio Mac',
    operatingSystem: 'darwin',
    reportedInventory: {
        runtimes: [
            { id: 'claude-code', label: 'Claude Code', models: [] },
            { id: 'codex', label: 'Codex', models: [] },
        ],
    },
};
const studioUsage = computerWith({
    computerId: 'cmp_studio',
    usage: {
        ...usageFixture,
        claude: {
            provider: 'claude',
            snapshot: {
                capturedAt: usageFixture.capturedAt,
                extraUsage: null,
                provider: 'claude',
                source: 'anthropic-oauth-usage',
                subscriptionType: 'max',
                windows: [
                    {
                        id: 'current-session',
                        label: 'Current session',
                        remainingPercent: 83,
                        resetsAt: null,
                        usedPercent: 17,
                    },
                    {
                        id: 'current-week-all-models',
                        label: 'Current week',
                        remainingPercent: 40,
                        resetsAt: null,
                        usedPercent: 60,
                    },
                ],
            },
            status: 'ok',
        },
    },
});

function renderGroup(
    agentLoop: AgentLoop,
    computer: typeof studio = studio,
    usage: ComputerUsage = studioUsage
) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(getQueryKey(hausTrpc.modelConnections.list, { serverId }, 'query'), {
        agentLoop,
        connections: [testConnection({ id: 'mcn_team', label: 'Team plan' })],
    });
    queryClient.setQueryData(getQueryKey(hausTrpc.computer.list, { serverId }, 'query'), [
        computer,
    ]);
    queryClient.setQueryData(getQueryKey(hausTrpc.stats.live, { serverId }, 'query'), {
        computers: [usage],
        tokenUsage: { breakdown: [], days: 90, totals: {} },
    });
    return renderWithTrpc(<ModelConnectionsGroup isOwner serverId={serverId} />, queryClient);
}

function rowTexts(html: string) {
    return [...html.matchAll(/<tr data-slot="table-row"[^>]*>(.*?)<\/tr>/gu)].map((match) =>
        [...(match[1] ?? '').matchAll(/<td[^>]*>(.*?)<\/td>/gu)].map((cell) =>
            (cell[1] ?? '').replaceAll(/<[^>]+>/gu, '').trim()
        )
    );
}

test('a Server whose Captains run on Devices lists each Device plan with what is left', () => {
    const html = renderGroup('computer');
    expect(html).toContain('>3 connections</');
    expect(rowTexts(html)).toEqual([
        ['Team planClaude · Default', '—', '—', '—', '', ''],
        ['CodexStudio Mac', '—', '87%', '—', '', ''],
        ['Claude CodeStudio Mac', '83%', '40%', '—', '', ''],
    ]);
    expect(html).toContain('aria-label="Claude Code 5h left"');
    expect(html).toContain('https://svgl.app/library/openai.svg');
});

test('a Device row only reads: no switch, menu, or details', () => {
    const html = renderGroup('computer');
    expect(html.split('role="switch"').length - 1).toBe(1);
    expect(html.split(' actions"').length - 1).toBe(1);
    expect(html.split('data-grid__tree-toggle-spacer"').length - 1).toBe(2);
    expect(html.split('aria-label="Expand row"').length - 1).toBe(1);
});

test('a Device runtime that is signed out reads Sign-in failed in place of its bars', () => {
    const signedOut = {
        ...studio,
        reportedInventory: {
            ...studio.reportedInventory,
            runtimeIssues: [
                {
                    kind: 'authentication',
                    observedAt: '2026-08-14T15:00:00.000Z',
                    runtimeId: 'claude-code',
                },
            ],
        },
    };
    expect(rowTexts(renderGroup('computer', signedOut))[2]).toEqual([
        'Claude CodeStudio Mac',
        'Sign-in failed',
        '',
        '—',
        '',
        '',
    ]);
});

test('on the runner the table holds the Server connections alone', () => {
    const html = renderGroup('runner');
    expect(html).toContain('>1 connection</');
    expect(html).not.toContain('Studio Mac');
});
