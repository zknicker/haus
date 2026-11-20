import { expect, test } from 'bun:test';
import { type AgentCliMessage, agentMessageSchema } from './agent-api-schemas.ts';
import { formatDeliveryEnvelope, formatHistoryLine } from './agent-format.ts';

function message(overrides: Partial<AgentCliMessage> = {}): AgentCliMessage {
    return {
        attachments: [],
        author: { id: 'agt_orbit', kind: 'agent', label: 'Orbit', metadata: {} },
        body_kind: 'text',
        chat_id: 'cht_product',
        content: 'The migration is staged. Should I run it?',
        created_at: '2026-09-03T12:00:00.000Z',
        deleted_at: null,
        delivery_id: null,
        id: 'msg_1a2b3c4d5e6f',
        metadata: {},
        nonce: 'msg-1',
        role: 'assistant',
        sender: { description: null, handle: 'orbit', type: 'agent' },
        sequence: 7,
        ...overrides,
    };
}

test('an ordinary Message carries no suffix, and the suffixes keep their order', () => {
    expect(formatHistoryLine(message())).toEndWith(
        '] orbit: The migration is staged. Should I run it?'
    );
    expect(
        formatHistoryLine(
            message({
                attachments: [{ filename: 'plan.md', id: 'att_1' }],
                claim: {
                    assignee: { handle: 'scout', id: 'agt_scout' },
                    claimed_at: null,
                    created_at: '2026-09-03T12:00:00.000Z',
                    number: 3,
                    origin: 'composed',
                    status: 'in_progress',
                    updated_at: '2026-09-03T12:00:00.000Z',
                },
            })
        )
    ).toEndWith(
        '[1 attachment: plan.md (id:att_1) — use haus attachment view to download]' +
            ' [claim #3 status=in_progress assignee=@scout]'
    );
});

type WorkerBody = NonNullable<AgentCliMessage['workers']>[number];

const latestRun: NonNullable<WorkerBody['latest_turn']> = {
    branches: [
        {
            branch: 'cloud/fix-flake',
            pull_request_url: 'https://github.com/haus/haus/pull/56',
            repository: 'haus/haus',
        },
    ],
    error_code: null,
    turn_id: 'car_1234567890abcdef',
    status: 'completed',
    summary: 'Opened a pull request.',
};

const worker: WorkerBody = {
    activity: null,
    id: 'caw_1234567890abcdef',
    latest_turn: latestRun,
    provider: 'cursor',
    provider_url: 'https://cursor.com/agents/bc_one',
    repository: 'haus/haus',
    starting_ref: 'main',
    status: 'completed',
    title: 'Fix the flaky delivery test',
};

test('a Worker Message names the pull request it opened', () => {
    const work = message({ workers: [worker] });

    expect(formatHistoryLine(work)).toEndWith(
        '[worker status=completed title=Fix the flaky delivery test pr=#56]'
    );
    expect(formatDeliveryEnvelope('#product', work)).toEndWith(
        '[worker status=completed title=Fix the flaky delivery test pr=#56]'
    );
});

test('work with no pull request yet reads exactly as it always did', () => {
    expect(
        formatHistoryLine(
            message({
                workers: [
                    {
                        ...worker,
                        latest_turn: { ...latestRun, branches: [] },
                        status: 'running',
                    },
                ],
            })
        )
    ).toEndWith('[worker status=running title=Fix the flaky delivery test]');
    expect(
        formatHistoryLine(
            message({
                workers: [{ ...worker, latest_turn: null, status: 'queued' }],
            })
        )
    ).toEndWith('[worker status=queued title=Fix the flaky delivery test]');
});

test('a text Message names every work it links, in link order', () => {
    const second = { ...worker, id: 'caw_fedcba0987654321', latest_turn: null };
    const linking = agentMessageSchema.parse({
        ...message({ content: 'Tracking [Fix the flaky delivery test](worker://caw_1).' }),
        workers: [worker, { ...second, status: 'running', title: 'Bump the lockfile' }],
    });

    expect(linking.body_kind).toBe('text');
    expect(formatHistoryLine(linking)).toEndWith(
        '[worker status=completed title=Fix the flaky delivery test pr=#56]' +
            ' [worker status=running title=Bump the lockfile]'
    );
});

test('a creating Message names the Agent it created, and says when that Agent is gone', () => {
    const created = {
        agent_id: 'agt_scout',
        description: 'Keeps release notes current.',
        display_name: 'Scout',
        handle: 'scout',
        retired: false,
    };
    const creation = message({
        agent_created: created,
        body_kind: 'agent-created',
        content: 'Scout is on the team now; they own release notes.',
    });

    expect(formatHistoryLine(creation)).toEndWith(
        'Scout is on the team now; they own release notes. [created @scout]'
    );
    expect(formatDeliveryEnvelope('#product', creation)).toEndWith('[created @scout]');
    expect(
        formatHistoryLine(
            message({
                agent_created: { ...created, retired: true },
                body_kind: 'agent-created',
            })
        )
    ).toEndWith('[created @scout (retired)]');
});

const zach = { handle: 'zach', id: 'usr_zach' };
const blippy = { handle: 'blippy', id: 'agt_blippy' };

test('a Message with no reactions carries no reactions suffix', () => {
    expect(formatHistoryLine(message({ reactions: [] }))).toEndWith('Should I run it?');
    expect(formatHistoryLine(message({ reactions: [{ actors: [], emoji: '👍' }] }))).toEndWith(
        'Should I run it?'
    );
});

test('reactions ride the read line grouped by emoji in arrival order', () => {
    expect(formatHistoryLine(message({ reactions: [{ actors: [zach], emoji: '👍' }] }))).toEndWith(
        'Should I run it? [reactions: 👍 @zach]'
    );
    const grouped = message({
        reactions: [
            { actors: [zach, blippy], emoji: '👍' },
            { actors: [zach], emoji: '🎉' },
        ],
    });
    expect(formatHistoryLine(grouped)).toEndWith(
        'Should I run it? [reactions: 👍 @zach, @blippy · 🎉 @zach]'
    );
    expect(formatDeliveryEnvelope('#product', grouped)).toEndWith(
        '[reactions: 👍 @zach, @blippy · 🎉 @zach]'
    );
});

test('a long actor list is capped, and a handleless actor reads as unknown', () => {
    const actors = [
        zach,
        blippy,
        { handle: null, id: 'usr_x' },
        ...['a', 'b', 'c'].map((h) => ({ handle: h, id: h })),
    ];
    expect(formatHistoryLine(message({ reactions: [{ actors, emoji: '👀' }] }))).toEndWith(
        '[reactions: 👀 @zach, @blippy, @unknown +3 more]'
    );
});

test('reactions follow every other suffix', () => {
    expect(
        formatHistoryLine(
            message({
                attachments: [{ filename: 'plan.md', id: 'att_1' }],
                reactions: [{ actors: [zach], emoji: '👍' }],
            })
        )
    ).toEndWith('download] [reactions: 👍 @zach]');
});

test("read and check lines print explicit UTC and a human sender's saved zone", () => {
    const human = message({
        sender: { description: null, handle: 'sam', timezone: 'America/Chicago', type: 'human' },
    });
    expect(formatHistoryLine(human)).toStartWith(
        '[seq=7 msg=msg_1a2b3c4d5e6f time=2026-09-03 12:00:00 UTC sender_tz=America/Chicago type=human]'
    );
    expect(formatDeliveryEnvelope('#general', human)).toStartWith(
        '[target=#general msg=1a2b3c4d time=2026-09-03 12:00:00 UTC sender_tz=America/Chicago type=human] sam:'
    );
    expect(formatDeliveryEnvelope('#general', message())).toStartWith(
        '[target=#general msg=1a2b3c4d time=2026-09-03 12:00:00 UTC type=agent] orbit:'
    );
});
