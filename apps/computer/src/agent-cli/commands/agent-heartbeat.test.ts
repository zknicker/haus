import { expect, test } from 'bun:test';
import type * as z from 'zod';
import { commandGroups } from '../../agent-cli.ts';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runHeartbeatLearned, runHeartbeatReport } from './agent-heartbeat.ts';
import { runLeadClaim, runLeadDone, runLeadList } from './agent-lead.ts';

interface Call {
    input: AgentApiRequest | undefined;
    route: string;
}

function fakeClient(response: unknown) {
    const calls: Call[] = [];
    const client: AgentApiRequester = {
        request: async <T>(route: string, schema: z.ZodType<T>, input?: AgentApiRequest) => {
            calls.push({ input, route });
            return schema.parse(response);
        },
    };
    let output = '';
    return {
        calls,
        deps: {
            client,
            readStdin: async () => '  from stdin  ',
            write: (text: string) => {
                output += text;
            },
        },
        output: () => output,
    };
}

function args(values: Record<string, string> = {}): ParsedArgs {
    return { flags: new Set(), help: false, positionals: [], values } as unknown as ParsedArgs;
}

const lead = {
    agentHandle: 'tiny',
    agentId: 'agt_tiny',
    anchorChatId: null,
    anchorMessageId: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    doneAt: null,
    finding: null,
    id: 'led_1',
    topic: 'Etsy payout was short',
};

test('the heartbeat and lead families are registered in the Agent CLI', () => {
    expect(commandGroups.heartbeat.map((sub) => sub.name)).toEqual(['report', 'learned']);
    expect(commandGroups.lead.map((sub) => sub.name)).toEqual(['claim', 'list', 'done']);
    for (const sub of [...commandGroups.heartbeat, ...commandGroups.lead]) {
        expect(sub.usage).toStartWith('haus ');
        expect(sub.examples.length).toBeGreaterThan(0);
    }
});

test('heartbeat report posts the stdin text, line breaks intact, and states the fact', async () => {
    const fake = fakeClient({ queued: true });
    fake.deps.readStdin = async () => ' - New reviews.\n- Two are 2-star. \n';
    expect(await runHeartbeatReport(args(), fake.deps)).toBe(0);
    expect(fake.calls).toEqual([
        {
            input: { body: { text: '- New reviews.\n- Two are 2-star.' }, method: 'POST' },
            route: '/api/agent/heartbeat/report',
        },
    ]);
    expect(fake.output()).toBe('Report queued for your main session.\n');
});

test('heartbeat learned reads stdin, and an empty body is refused', async () => {
    const fake = fakeClient({ saved: true });
    await runHeartbeatLearned(args(), fake.deps);
    expect(fake.calls[0]).toEqual({
        input: { body: { text: 'from stdin' }, method: 'POST' },
        route: '/api/agent/heartbeat/learned',
    });
    const empty = fakeClient({});
    empty.deps.readStdin = async () => '   ';
    await expect(runHeartbeatReport(args(), empty.deps)).rejects.toMatchObject({
        code: 'MISSING_CONTENT',
    });
    expect(empty.calls).toEqual([]);
});

test('heartbeat refuses --text and positional text with the stdin recipe', async () => {
    const fake = fakeClient({});
    const flagged = { ...args(), flags: { '--text': true } } as unknown as ParsedArgs;
    const error = await runHeartbeatLearned(flagged, fake.deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AgentCliError);
    expect(error).toMatchObject({ code: 'TEXT_FLAG_UNSUPPORTED' });
    const positional = { ...args(), positionals: ['x'] } as unknown as ParsedArgs;
    await expect(runHeartbeatReport(positional, fake.deps)).rejects.toMatchObject({
        code: 'POSITIONAL_CONTENT_UNSUPPORTED',
    });
    expect(fake.calls).toEqual([]);
});

test('lead claim states the lead, or who already holds it', async () => {
    const won = fakeClient({ claimed: true, lead });
    await runLeadClaim(
        args({ '--message-id': 'msg_1', '--topic': 'Etsy payout was short' }),
        won.deps
    );
    expect(won.calls[0]).toEqual({
        input: { body: { messageId: 'msg_1', topic: 'Etsy payout was short' }, method: 'POST' },
        route: '/api/agent/leads',
    });
    expect(won.output()).toBe('Claimed lead led_1: Etsy payout was short\n');

    const lost = fakeClient({
        claimed: false,
        heldBy: { agentHandle: 'tiny', agentId: 'agt_tiny' },
        leadId: 'led_1',
    });
    await runLeadClaim(args({ '--topic': 'x' }), lost.deps);
    expect(lost.output()).toBe('Already claimed by @tiny (lead led_1).\n');
    expect(lost.calls[0]?.input?.body).toEqual({ topic: 'x' });
});

test('lead list renders open and done leads, or says there are none', async () => {
    const some = fakeClient({
        leads: [
            lead,
            { ...lead, doneAt: '2026-10-20T11:00:00.000Z', finding: 'Posted late.', id: 'led_2' },
        ],
    });
    await runLeadList(some.deps);
    expect(some.calls[0]?.route).toBe('/api/agent/leads');
    expect(some.output()).toBe(
        [
            'led_1  @tiny  Etsy payout was short  [open]',
            'led_2  @tiny  Etsy payout was short  [done: Posted late.]',
            '',
        ].join('\n')
    );
    const none = fakeClient({ leads: [] });
    await runLeadList(none.deps);
    expect(none.output()).toBe('No leads in the last 7 days.\n');
});

test('lead done records the finding on the lead', async () => {
    const fake = fakeClient({ lead });
    await runLeadDone(args({ '--finding': 'Posted late.', '--id': 'led_1' }), fake.deps);
    expect(fake.calls).toEqual([
        {
            input: { body: { finding: 'Posted late.' }, method: 'POST' },
            route: '/api/agent/leads/led_1/done',
        },
    ]);
    expect(fake.output()).toBe('Lead led_1 marked done.\n');
    await expect(runLeadDone(args({ '--id': 'led_1' }), fake.deps)).rejects.toBeInstanceOf(
        AgentCliError
    );
});
