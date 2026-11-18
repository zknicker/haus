import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AdventCalendar, AdventEntry } from '@haus/api';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let outsider: HausClient;
let serverId: string;
let agentId: string;

const computerId = 'cmp_advent0000000000';
/** Message words that must never come back in a calendar. */
const secrets = ['SECRET-PINEAPPLE', 'SECRET-MANGO', 'SECRET-KIWI'];

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_advent_owner');
    outsider = await signIn('user_advent_outsider');
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Advent Inn', slug: 'advent-inn' })
    ).id;
    await outsider.trpc.server.create.mutate({
        displayName: 'Elsewhere',
        slug: 'advent-elsewhere',
    });
    const ownerUserId = harness.humans.userIdForSubject('user_advent_owner');
    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
        ) values (
            ${computerId}, ${serverId}, ${ownerUserId}, ${'f'.repeat(64)},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;
    agentId = (
        await owner.trpc.agent.create.mutate({
            computerId,
            displayName: 'Blippy',
            handle: 'advent-blippy',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId,
        })
    ).agent.id;
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [agentId],
        name: 'lanterns',
        serverId,
    });

    // New York evening of Fri Feb 28 2025 is the small hours of Sat Mar 1 in UTC.
    const sends = [
        {
            at: '2025-03-01T02:30:00Z',
            content: `${secrets[0]} thanks [@Blippy](agent://${agentId})`,
        },
        { at: '2025-03-01T02:45:00Z', content: `${secrets[1]} by the fire` },
        { at: '2025-06-15T13:05:00Z', content: `${secrets[2]} on a Sunday` },
        // Monday evening in New York, already Tuesday in UTC.
        { at: '2025-06-17T01:50:00Z', content: 'and again on Monday' },
    ];
    const ids: string[] = [];
    for (const [index, send] of sends.entries()) {
        const sent = await owner.trpc.chat.send.mutate({
            chatId: channel.id,
            content: send.content,
            nonce: `advent-${index}`,
            serverId,
        });
        ids.push(sent.message.id);
        await harness.sql`update chat_messages set created_at = ${send.at}::timestamptz where id = ${sent.message.id}`;
    }
    await owner.trpc.chat.react.mutate({ emoji: '🎉', messageId: ids[1] as string, serverId });
    await harness.sql`update message_reactions set created_at = '2025-03-02T12:00:00Z' where server_id = ${serverId}`;
    // Channel creation stamps the Chat and its creator's participant row together.
    await harness.sql`update chats set created_at = '2025-02-01T12:00:00Z' where id = ${channel.id}`;
    await harness.sql`
        update channel_participants set created_at = '2025-02-01T12:00:00Z'
        where chat_id = ${channel.id} and user_id = ${ownerUserId}
    `;
    await harness.sql`
        insert into agent_turns (
            id, server_id, agent_id, computer_id, run_id, started_at, ended_at, status, summary,
            model_id, runtime_id, token_usage_reported, input_tokens, output_tokens, total_tokens
        ) values (
            'atn_advent0000000001', ${serverId}, ${agentId}, ${computerId}, 'run_advent_1',
            '2025-03-01T03:00:00Z', '2025-03-01T03:01:00Z', 'completed', 'done',
            'gpt-5.6-sol', 'codex', true, 1000000, 250000, 1250000
        )
    `;
});

afterAll(async () => {
    owner?.close();
    outsider?.close();
    await harness?.close();
});

test('a past year opens every door, buckets by the member zone, and never returns message text', async () => {
    const calendar = await owner.trpc.advent.calendar.query({
        serverId,
        throughDay: 25,
        timeZone: 'America/New_York',
        year: 2025,
    });

    expect(calendar.entries.map((entry) => entry.day)).toEqual(
        Array.from({ length: 24 }, (_, index) => index + 1)
    );
    expect(strongRuns(calendar, 'messages-sent')).toEqual(['4']);
    expect(strongRuns(calendar, 'loudest-channel')).toContain('#lanterns');
    expect(strongRuns(calendar, 'busiest-hour')).toContain('9pm');
    expect(strongRuns(calendar, 'busiest-day')).toContain('February 28');
    expect(strongRuns(calendar, 'night-owl')).toEqual([]);
    expect(strongRuns(calendar, 'weekends-off')).toContain('25%');
    expect(strongRuns(calendar, 'agents-at-table')).toEqual(['1']);
    expect(strongRuns(calendar, 'most-thanked-agent')).toEqual(
        expect.arrayContaining(['Blippy', '1'])
    );
    expect(strongRuns(calendar, 'favorite-reaction')).toContain('🎉');
    expect(strongRuns(calendar, 'new-channels')).toContain('#lanterns');
    expect(strongRuns(calendar, 'tokens-used')).toContain('1.3 million');
    expect(strongRuns(calendar, 'hardest-worker')).toEqual(expect.arrayContaining(['Blippy', '1']));
    expect(strongRuns(calendar, 'longest-streak')).toContain('2 days');

    const recap = calendar.entries.at(-1);
    expect(recap).toMatchObject({ day: 24, fact: 'recap', kind: 'recap' });
    expect(recap?.kind === 'recap' && recap.stats).toEqual(
        expect.arrayContaining([
            { label: 'Messages', value: '4' },
            { label: 'Most thanked', value: 'Blippy' },
            { label: 'Busiest hour', value: '9pm' },
        ])
    );

    const wire = JSON.stringify(calendar);
    for (const secret of secrets) {
        expect(wire).not.toContain(secret);
    }
    expect(wire).not.toContain('agent://');
});

test('the same messages bucket into UTC hours and days for a UTC member', async () => {
    const calendar = await owner.trpc.advent.calendar.query({
        serverId,
        throughDay: 23,
        timeZone: 'UTC',
        year: 2025,
    });
    expect(calendar.entries).toHaveLength(23);
    expect(strongRuns(calendar, 'busiest-hour')).toContain('2am');
    expect(strongRuns(calendar, 'busiest-day')).toContain('March 1');
    expect(strongRuns(calendar, 'night-owl')).toEqual(['3']);
    expect(strongRuns(calendar, 'weekends-off')).toContain('75%');
    expect(strongRuns(calendar, 'longest-streak')).toContain('1 day');
});

test('doors stay shut until they open somewhere on Earth', async () => {
    await expect(
        owner.trpc.advent.calendar.query({ serverId, throughDay: 1, timeZone: 'UTC', year: 2100 })
    ).rejects.toThrow(/not opened yet/);
});

test('refuses a zone that is not IANA, and a non-member', async () => {
    await expect(
        owner.trpc.advent.calendar.query({
            serverId,
            throughDay: 1,
            timeZone: '+05:00',
            year: 2025,
        })
    ).rejects.toThrow(/IANA/);
    await expect(
        outsider.trpc.advent.calendar.query({
            serverId,
            throughDay: 1,
            timeZone: 'UTC',
            year: 2025,
        })
    ).rejects.toThrow();
});

function strongRuns(calendar: AdventCalendar, fact: AdventEntry['fact']): string[] {
    const entry = calendar.entries.find((candidate) => candidate.fact === fact);
    if (!entry || entry.kind !== 'fact') {
        throw new Error(`No ${fact} door.`);
    }
    return entry.line.filter((run) => run.strong).map((run) => run.text);
}

async function signIn(subject: string) {
    harness.humans.setVerifiedEmails(subject, [`${subject}@example.com`]);
    return createHausClient(harness, await harness.humans.mintSessionToken(subject));
}
