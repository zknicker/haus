import { expect, test } from 'bun:test';
import { runTriggerList } from './agent-trigger.ts';
import { args, githubTrigger, requester } from './agent-trigger-test-fixtures.ts';

const { github: _github, ...base } = githubTrigger;

const linearTrigger = {
    ...base,
    id: 'trg_ln',
    kind: 'linear',
    linear: {
        connectionId: 'mcp_linear',
        display: { 'state-review': 'Design Review', 'team-des': 'Design' },
        groups: [
            {
                actions: ['update'],
                changed: ['state'],
                delegates: [{ agent: 'agt_test' }],
                event: 'issue',
                stateTo: ['state-review'],
                teams: ['team-des'],
            },
        ],
        problem: 'teams_unavailable',
        problemSince: '2026-10-15T11:00:00.000Z',
        selfSuppressedCount: 3,
        suppressedCount: 1,
        workspaceName: 'Haus',
    },
    title: 'Design needs review',
};

test('lists a Linear Trigger read-only, by display name, with both suppressed counts', async () => {
    const written: string[] = [];
    await runTriggerList(args({}), {
        client: requester(() => ({ triggers: [linearTrigger] })),
        write: (text) => written.push(text),
    });

    expect(written.join('')).toBe(
        [
            'trg_ln [linear · armed · degraded: teams unavailable] "Design needs review" — never fired, anchored in #general — Linear Haus',
            '  groups: issue update changed=state delegates=agent:agt_test stateTo=Design Review teams=Design',
            '  suppressed over the rate limit: 1',
            '  suppressed as your own changes: 3',
            '',
        ].join('\n')
    );
});
