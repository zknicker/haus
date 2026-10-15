import { expect, test } from 'bun:test';
import { runTriggerList, runTriggerShow } from './agent-trigger.ts';
import { args, linearTrigger, requester } from './agent-trigger-test-fixtures.ts';

test('lists a Linear Trigger by display name, with both suppressed counts', async () => {
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

test('show names the human fix for a Linear problem', async () => {
    const written: string[] = [];
    await runTriggerShow(args({ '--id': 'trg_ln' }), {
        client: requester(() => ({ trigger: linearTrigger })),
        write: (text) => written.push(text),
    });

    expect(written.join('')).toContain(
        'Not firing. A team this trigger watches left the Haus app’s team access.'
    );
});
