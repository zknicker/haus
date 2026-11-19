import { expect, test } from 'bun:test';
import { parseStartCommand } from '../agent-command-frames.ts';
import { composeTurnPrompt, turnDeliveryOf } from './turn-prompt.ts';

const driveConflict = {
    files: [
        {
            copyPath: 'haus/plan.conflict-blippy.md',
            currentAuthorHandle: 'ada',
            currentRevisionId: 'rev_1',
            outcome: 'kept_both',
            path: 'haus/plan.md',
            reason: 'same_lines',
        },
    ],
    id: 'drive-conflict:run_push',
    pushId: 'run_push',
    writer: { agentId: 'agt_test', type: 'agent' },
};

const conflictFrame = {
    agentId: 'agt_test',
    agentName: 'blippy',
    chatId: null,
    drainItemIds: [],
    driveConflict,
    inbox: [],
    inboxDelivery: 'concrete',
    modelId: 'm',
    runId: 'run_conflict',
    runtimeId: 'claude-code',
    sessionGeneration: 2,
    totalPending: 0,
    type: 'start',
    unreadElsewhere: [],
    warmDrainItemIds: [],
};

test('a Drive conflict frame parses chatless, and never beside a Chat or another attention', () => {
    expect(parseStartCommand(conflictFrame)).toMatchObject({ chatId: null, driveConflict });
    expect(
        parseStartCommand({ ...conflictFrame, driveConflict: { ...driveConflict, later: 1 } })
    ).toMatchObject({ driveConflict: { later: 1 } });

    expect(parseStartCommand({ ...conflictFrame, chatId: 'cht_1' })).toBeNull();
    expect(parseStartCommand({ ...conflictFrame, inboxDelivery: 'notice' })).toBeNull();
    expect(parseStartCommand({ ...conflictFrame, drainItemIds: ['msg_1'] })).toBeNull();
    expect(
        parseStartCommand({ ...conflictFrame, driveConflict: { ...driveConflict, files: [] } })
    ).toBeNull();
    expect(
        parseStartCommand({
            ...conflictFrame,
            subagentWake: { createdAt: '2026-10-21T10:00:00.000Z', id: 'subagent:agt_test:wake' },
        })
    ).toBeNull();
});

test('a Drive conflict run is the whole turn input', () => {
    const command = parseStartCommand(conflictFrame);
    if (!command) {
        throw new Error('the frame did not parse');
    }
    const prompt = composeTurnPrompt(
        {
            ...turnDeliveryOf(command),
            agentId: 'agt_test',
            dataRoot: '/tmp/unused',
            homeTimezone: 'UTC',
            runId: 'run_conflict',
            serverId: 'srv_test',
        },
        { isColdStart: false, sessionGeneration: 2 }
    );

    expect(prompt).toEqual({
        drained: [],
        notice: null,
        turnContent: [
            '[drive conflict · 1 file · your push after run_push]',
            'haus/plan.md · @ada changed the same lines · yours: haus/plan.conflict-blippy.md',
            'Each original holds the current version and each copy holds yours. Merge what you still want into the original with ordinary file commands in drive/, then delete the copy.',
        ].join('\n'),
    });
});
