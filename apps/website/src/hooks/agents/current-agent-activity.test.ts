import { expect, test } from 'bun:test';
import type { AgentCurrentActivity } from '@haus/api';
import {
    applyCurrentAgentActivityEvent,
    filterCurrentAgentActivityByAvailability,
    filterCurrentAgentActivityByLifecycle,
    formatCurrentAgentActivityLabel,
    mergeCurrentAgentActivityLiveEvent,
    projectCurrentAgentActivitySnapshot,
    reconcileCurrentAgentActivity,
} from './current-agent-activity.ts';

function activity(overrides: Partial<AgentCurrentActivity> = {}): AgentCurrentActivity {
    return {
        agentId: 'agt_one',
        category: 'thinking',
        id: 'aev_one',
        occurredAt: '2026-08-11T12:00:00.000Z',
        runStartedAt: null,
        phase: 'started',
        position: 1,
        producer: 'server',
        producerId: 'server',
        producerSequence: 1,
        runId: 'run_one',
        serverId: 'srv_one',
        ...overrides,
    };
}

test('category changes replace the row without changing turn order', () => {
    const oldest = activity();
    const newer = activity({
        agentId: 'agt_two',
        id: 'aev_two',
        runId: 'run_two',
    });
    const categoryChange = activity({
        category: 'editing_files',
        id: 'aev_three',
        position: 2,
    });

    const result = applyCurrentAgentActivityEvent(
        applyCurrentAgentActivityEvent([oldest, newer], categoryChange),
        activity({
            agentId: 'agt_three',
            id: 'aev_four',
            runId: 'run_three',
        })
    );

    expect(result.map((item) => item.agentId)).toEqual(['agt_one', 'agt_two', 'agt_three']);
    expect(result[0]?.category).toBe('editing_files');
});

test('semantic completion falls back to working through Server settlement delivery', () => {
    const active = activity();
    const betweenTools = applyCurrentAgentActivityEvent(
        [active],
        activity({
            category: 'checking_messages',
            id: 'aev_done',
            phase: 'completed',
            position: 2,
            producer: 'computer',
        })
    );

    expect(betweenTools).toEqual([
        activity({
            category: 'working',
            id: 'aev_done',
            phase: 'started',
            position: 2,
            producer: 'computer',
        }),
    ]);

    const afterFailedTool = applyCurrentAgentActivityEvent(
        betweenTools,
        activity({
            category: 'running_command',
            id: 'aev_tool_failed',
            phase: 'failed',
            position: 3,
            producer: 'computer',
        })
    );

    expect(afterFailedTool[0]?.category).toBe('working');

    const settled = applyCurrentAgentActivityEvent(
        afterFailedTool,
        activity({
            category: 'working',
            id: 'aev_settled',
            phase: 'completed',
            position: 4,
            producer: 'server',
        })
    );

    expect(settled).toEqual(afterFailedTool);
    expect(
        applyCurrentAgentActivityEvent(
            afterFailedTool,
            activity({
                category: 'working',
                id: 'aev_failed_turn',
                phase: 'failed',
                position: 4,
                producer: 'server',
            })
        )
    ).toEqual(afterFailedTool);
});

test('a committed Agent message presents finishing activity', () => {
    const committedMessage = activity({
        category: 'sending_message',
        id: 'aev_send_done',
        phase: 'completed',
        position: 2,
        producer: 'server',
    });

    expect(
        applyCurrentAgentActivityEvent(
            [activity({ category: 'sending_message' })],
            committedMessage
        )
    ).toEqual([committedMessage]);
    expect(formatCurrentAgentActivityLabel(committedMessage)).toBe('Finishing up…');
});

test('a late Computer completion preserves finishing activity after a committed message', () => {
    const afterMessage = applyCurrentAgentActivityEvent(
        [activity({ category: 'running_command' })],
        activity({
            category: 'sending_message',
            id: 'aev_send_done',
            phase: 'completed',
            position: 2,
            producer: 'server',
        })
    );
    const afterCommandTail = applyCurrentAgentActivityEvent(
        afterMessage,
        activity({
            category: 'running_command',
            id: 'aev_command_done',
            phase: 'completed',
            position: 3,
            producer: 'computer',
        })
    );

    expect(afterMessage).toEqual([
        activity({
            category: 'sending_message',
            id: 'aev_send_done',
            phase: 'completed',
            position: 2,
            producer: 'server',
        }),
    ]);
    expect(afterCommandTail).toEqual(afterMessage);
});

test('the live overlay keeps finishing activity across trailing completions', () => {
    const snapshot = activity({ category: 'running_command', position: 9 });
    const messageCommitted = activity({
        category: 'sending_message',
        id: 'aev_message',
        phase: 'completed',
        position: 11,
        producer: 'server',
    });
    const trailingCommand = activity({
        category: 'running_command',
        id: 'aev_command_done',
        phase: 'completed',
        position: 12,
        producer: 'computer',
    });
    const committedOverlay = mergeCurrentAgentActivityLiveEvent(undefined, messageCommitted);
    const overlay = mergeCurrentAgentActivityLiveEvent(committedOverlay, trailingCommand);

    expect(overlay.latestPosition).toBe(12);
    expect(reconcileCurrentAgentActivity([snapshot], [overlay.event])).toEqual([messageCommitted]);
    expect(
        mergeCurrentAgentActivityLiveEvent(
            overlay,
            activity({ category: 'thinking', id: 'aev_stale', position: 10 })
        )
    ).toBe(overlay);
    expect(
        mergeCurrentAgentActivityLiveEvent(
            overlay,
            activity({ category: 'thinking', id: 'aev_new_work', position: 13 })
        ).event.category
    ).toBe('thinking');
});

test('the live overlay keeps working absolute after a started operation completes', () => {
    const started = mergeCurrentAgentActivityLiveEvent(
        undefined,
        activity({ category: 'running_command', position: 20 })
    );
    const completed = mergeCurrentAgentActivityLiveEvent(
        started,
        activity({
            category: 'running_command',
            id: 'aev_command_done',
            phase: 'completed',
            position: 21,
            producer: 'computer',
        })
    );

    expect(reconcileCurrentAgentActivity([], [completed.event])).toEqual([
        activity({
            category: 'working',
            id: 'aev_command_done',
            phase: 'started',
            position: 21,
            producer: 'computer',
        }),
    ]);
});

test('turn settlement keeps the row until canonical availability stops working', () => {
    const finishing = activity({
        category: 'sending_message',
        phase: 'completed',
        position: 2,
        producer: 'server',
    });
    const terminal = activity({
        category: 'working',
        phase: 'completed',
        position: 3,
        producer: 'server',
    });
    const terminalOverlay = mergeCurrentAgentActivityLiveEvent(
        mergeCurrentAgentActivityLiveEvent(undefined, finishing),
        terminal
    );
    const projected = reconcileCurrentAgentActivity([finishing], [terminalOverlay.event]);

    expect(terminalOverlay.event).toEqual(finishing);
    expect(terminalOverlay.latestPosition).toBe(3);
    expect(
        filterCurrentAgentActivityByAvailability(projected, [
            { availability: 'working', id: 'agt_one' },
        ])
    ).toEqual([finishing]);
    expect(
        filterCurrentAgentActivityByAvailability(projected, [
            { availability: 'idle', id: 'agt_one' },
        ])
    ).toEqual([]);
});

test('a newer active lifecycle cannot revive the previous run finishing row', () => {
    const finishing = activity({ category: 'sending_message', phase: 'completed' });

    expect(
        filterCurrentAgentActivityByLifecycle(
            [finishing],
            new Map([
                [
                    'agt_one',
                    {
                        agentId: 'agt_one',
                        chatId: 'cht_one',
                        emittedAt: '2026-08-14T12:00:01.000Z',
                        phase: 'working',
                        runId: 'run_two',
                        serverId: 'srv_one',
                    },
                ],
            ])
        )
    ).toEqual([]);
});

test('reconnect snapshots consume the Server current-activity projection', () => {
    expect(
        projectCurrentAgentActivitySnapshot([
            activity({ category: 'working', id: 'aev_done', position: 2 }),
        ])
    ).toEqual([
        activity({
            category: 'working',
            id: 'aev_done',
            phase: 'started',
            position: 2,
        }),
    ]);
});

test('reconnect snapshots preserve a finishing turn', () => {
    const finishing = activity({
        category: 'sending_message',
        phase: 'completed',
        position: 3,
        producer: 'server',
    });

    expect(projectCurrentAgentActivitySnapshot([finishing])).toEqual([finishing]);
});

test('stale events cannot roll back a newer current category', () => {
    const current = activity({ category: 'editing_files', id: 'aev_two', position: 2 });
    const stale = activity({ id: 'aev_one', position: 1 });

    expect(applyCurrentAgentActivityEvent([current], stale)).toEqual([current]);
});

test('semantic activity labels use the product catalog', () => {
    expect(formatCurrentAgentActivityLabel(activity({ category: 'starting_work' }))).toBe(
        'Starting work…'
    );
    expect(formatCurrentAgentActivityLabel(activity({ category: 'running_command' }))).toBe(
        'Running a command…'
    );
    expect(formatCurrentAgentActivityLabel(activity({ category: 'using_tool' }))).toBe(
        'Using a tool…'
    );
    expect(formatCurrentAgentActivityLabel(activity({ category: 'updating_instructions' }))).toBe(
        'Updating instructions…'
    );
});

test('semantic activity never overrides canonical Agent availability', () => {
    const activities = [activity(), activity({ agentId: 'agt_two', runId: 'run_two' })];

    expect(
        filterCurrentAgentActivityByAvailability(activities, [
            { availability: 'offline', id: 'agt_one' },
            { availability: 'working', id: 'agt_two' },
        ])
    ).toEqual([activities[1]]);
    expect(
        filterCurrentAgentActivityByAvailability(activities, [
            { availability: 'error', id: 'agt_one' },
            { availability: 'stopped', id: 'agt_two' },
        ])
    ).toEqual([]);
});
