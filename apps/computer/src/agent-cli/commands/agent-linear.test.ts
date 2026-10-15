import { expect, test } from 'bun:test';
import { runLinearWorkspaces } from './agent-linear.ts';
import { args, requester } from './agent-trigger-test-fixtures.ts';

test('lists workspaces with url keys, teams, and how the Agent posts', async () => {
    const routes: string[] = [];
    const written: string[] = [];
    await runLinearWorkspaces(args({}), {
        client: requester((route) => {
            routes.push(route);
            return {
                workspaces: [
                    {
                        connectionId: 'mcp_linear',
                        hasIdentity: true,
                        id: 'lnw_0123456789abcdef',
                        name: 'Acme',
                        status: 'active',
                        teams: [
                            { id: 'team-des', key: 'DES', name: 'Design' },
                            { id: 'team-ops', key: 'OPS', name: 'Operations' },
                        ],
                        urlKey: 'acme',
                    },
                    {
                        connectionId: 'mcp_globex',
                        hasIdentity: false,
                        id: 'lnw_fedcba9876543210',
                        name: 'Globex',
                        status: 'refresh_required',
                        teams: [],
                        urlKey: 'globex',
                    },
                ],
            };
        }),
        write: (text) => written.push(text),
    });

    expect(routes).toEqual(['/api/agent/linear/workspaces']);
    expect(written.join('')).toBe(
        [
            'Acme [acme] you post as your own Linear identity — use --workspace acme',
            '  teams: DES Design, OPS Operations',
            'Globex [globex · refresh required] you post through the Haus app — use --workspace globex',
            '  teams: none synced yet',
            '',
        ].join('\n')
    );
});

test('explains who connects Linear when no workspace is usable', async () => {
    const written: string[] = [];
    await runLinearWorkspaces(args({}), {
        client: requester(() => ({ workspaces: [] })),
        write: (text) => written.push(text),
    });
    expect(written.join('')).toContain('Settings → Connections → Linear');
});
