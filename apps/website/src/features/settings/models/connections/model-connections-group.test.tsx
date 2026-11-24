import { describe, expect, test } from 'bun:test';
import type { ModelConnection } from '@haus/api';
import { installRealtimeTestDom } from '../../../../test-support/realtime-stream-harness.tsx';
import { mountCallHook } from '../../../../test-support/trpc-call-harness.tsx';
import { renderWithTrpc } from '../../../../test-support/trpc-test-provider.tsx';
import { connectionRows } from './connections-table-model.ts';
import { testConnection } from './model-connection.fixture.ts';
import { ModelConnectionsTable } from './model-connections-group.tsx';
import { useConnectionTableActions } from './use-connection-table-actions.ts';

installRealtimeTestDom();

const now = Date.parse('2026-11-20T12:00:00.000Z');
const team = testConnection({
    capacity: [
        {
            id: 'current-session',
            label: '5-hour',
            resetsAt: '2026-11-20T15:00:00.000Z',
            usedPercent: 42,
        },
        {
            id: 'current-week-all-models',
            label: 'Weekly',
            resetsAt: '2026-11-23T12:00:00.000Z',
            usedPercent: 81.6,
        },
    ],
    id: 'mcn_team',
    label: 'Team plan',
});
const gemini = testConnection({
    authKind: 'api-key',
    id: 'mcn_gemini',
    label: 'Gemini key',
    provider: 'gemini',
    webSearch: true,
});
const failedGemini = { ...gemini, status: 'failed' as const, statusDetail: 'API key not valid.' };

function render(connections: ModelConnection[], isOwner = true) {
    return renderWithTrpc(
        <ModelConnectionsTable
            connections={connections}
            isOwner={isOwner}
            now={now}
            rows={connectionRows(connections)}
            serverId="srv_1"
        />
    );
}

function count(html: string, text: string) {
    return html.split(text).length - 1;
}

function cellTexts(html: string) {
    return [...html.matchAll(/<td[^>]*>(.*?)<\/td>/gu)]
        .map((match) => (match[1] ?? '').replaceAll(/<[^>]+>/gu, '').trim())
        .filter(Boolean);
}

describe('the connections table', () => {
    test('titles the section Connections with a muted count, and holds one empty row when empty', () => {
        expect(render([team, gemini])).toMatch(
            /Connections<span class="text-muted[^"]*"><span class="sr-only"> <\/span>2<\/span>/u
        );
        const empty = render([]);
        expect(empty).toContain('No connections yet.');
        expect(empty).not.toContain('sr-only"> </span>0');
        expect(empty).not.toContain('role="grid"');
    });

    test('a row reads its logo tile, label, provider, what is left of each window, and the soonest reset', () => {
        const html = render([team]);
        expect(html).toContain('https://svgl.app/library/anthropic_black.svg');
        expect(html).toContain('border-radius:calc(var(--radius) * 2);height:32px;width:32px');
        expect(cellTexts(html)).toEqual(['Team planClaude · Default', '58%', '18%', '3h']);
        expect(html).toContain('aria-label="Team plan 5-hour left"');
        expect(html).toContain('aria-label="Team plan Weekly left"');
        expect(count(html, 'role="progressbar"')).toBe(2);
    });

    test('a window the runner has not read shows a dash, never 0%', () => {
        expect(cellTexts(render([{ ...team, capacity: null, isDefault: false }]))).toEqual([
            'Team planClaude',
            '—',
            '—',
            '—',
        ]);
    });

    test('a failed connection shows Failed in place of the bars and opens on its failure', () => {
        const html = render([failedGemini]);
        expect(count(html, 'role="progressbar"')).toBe(0);
        expect(cellTexts(html)).toEqual([
            'Gemini keyGemini · Default',
            'Failed',
            '—',
            'A pasted API key. The Server keeps it encrypted and never shows it again.API key not valid.Web search',
        ]);
    });

    test('expanding a row shows its web search switch', () => {
        expect(render([gemini])).not.toContain('Web search for Gemini key');
        const expanded = render([failedGemini]);
        expect(expanded).toContain('aria-label="Web search for Gemini key"');
        expect(expanded).toContain('A pasted API key. The Server keeps it encrypted');
    });

    test("each row's chevron is named by its row", () => {
        const html = render([team, gemini]);
        for (const id of ['mcn_team', 'mcn_gemini']) {
            const chevron = html.match(
                new RegExp(
                    `<button[^>]*aria-labelledby="([^" ]+) ([^"]+-${id}-account)"[^>]*slot="chevron"`,
                    'u'
                )
            );
            expect(chevron?.[2]).toBeDefined();
            expect(html).toContain(`id="${chevron?.[2]}" role="rowheader"`);
        }
    });

    test('the Owner gets Add connection and one menu on each row, with no switch beside it', () => {
        const html = render([team, gemini]);
        expect(count(html, '>Add connection<')).toBe(1);
        expect(count(html, 'aria-label="Team plan actions"')).toBe(1);
        expect(count(html, 'aria-label="Gemini key actions"')).toBe(1);
        expect(html).not.toContain('aria-label="Use ');
    });

    test('an account that is turned off says Off beside its name; one in use stays quiet', () => {
        const html = render([team, { ...gemini, enabled: false }]);
        expect(count(html, '>Off<')).toBe(1);
        expect(cellTexts(html)[0]).toBe('Team planClaude · Default');
    });

    test('a member sees no Add connection or menus, and web search only reads', () => {
        const html = render([team, { ...failedGemini, enabled: false }], false);
        expect(count(html, '>Add connection<')).toBe(0);
        expect(count(html, ' actions"')).toBe(0);
        expect(count(html, '>Off<')).toBe(1);
        expect(/<input aria-label="Web search for Gemini key"[^>]*>/u.exec(html)?.[0]).toContain(
            'disabled=""'
        );
    });
});

describe('the table actions', () => {
    test('Turn off saves through setEnabled for that one connection', async () => {
        const { harness, hook, mounted } = await mountCallHook(
            () => useConnectionTableActions({ isOwner: true, now, serverId: 'srv_1' }),
            () => ({ ...team, enabled: false })
        );
        const settled = new Promise<void>((resolve) => {
            const stop = harness.queryClient.getMutationCache().subscribe((event) => {
                if (event.mutation?.state.status === 'success') {
                    stop();
                    resolve();
                }
            });
        });
        await harness.act(async () => {
            hook().actions.onAction(team, 'turn-off');
            await settled;
        });
        expect(harness.calls).toEqual([
            {
                input: { connectionId: 'mcn_team', enabled: false, serverId: 'srv_1' },
                path: 'modelConnections.setEnabled',
                type: 'mutation',
            },
        ]);
        await mounted.unmount();
    });

    test('Reconnect opens the provider dialog on that connection, and Rename its rename dialog', async () => {
        const { harness, hook, mounted } = await mountCallHook(() =>
            useConnectionTableActions({ isOwner: true, now, serverId: 'srv_1' })
        );
        await harness.act(() => hook().actions.onAction(gemini, 'reconnect'));
        expect(hook().dialog).toEqual({ provider: 'gemini', replacing: gemini });
        await harness.act(() => hook().actions.onAction(team, 'rename'));
        expect(hook().renaming).toEqual(team);
        expect(harness.calls).toEqual([]);
        await mounted.unmount();
    });
});
