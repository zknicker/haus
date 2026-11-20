import { expect, test } from 'bun:test';
import { agentCommandSchema, agentTurnSummarySchema } from './agent-runner.ts';

test('Agent restart carries only the Agent identity', () => {
    expect(
        agentCommandSchema.parse({
            agentId: 'agt_restart',
            type: 'agent-restart',
        })
    ).toEqual({
        agentId: 'agt_restart',
        type: 'agent-restart',
    });
    expect(
        agentCommandSchema.safeParse({
            agentId: 'agt_restart',
            sessionGeneration: 2,
            type: 'agent-restart',
        }).success
    ).toBe(false);
});

test('turn summaries carry durable activity and explicit interruption', () => {
    const turn = {
        activity: {
            operations: [
                {
                    category: 'using_tool',
                    completed: 0,
                    failed: 0,
                    interrupted: 1,
                },
            ],
        },
        agentId: 'agt_turn',
        endedAt: '2026-08-11T12:00:01.000Z',
        messageCount: 0,
        modelId: 'gpt-5.6-sol',
        outputProduced: false,
        runId: 'run_turn',
        runtimeId: 'codex',
        startedAt: '2026-08-11T12:00:00.000Z',
        status: 'interrupted',
        summary: 'The Agent turn was interrupted.',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };

    const parsed = agentTurnSummarySchema.parse(turn);
    expect(parsed.status).toBe('interrupted');
    expect(parsed.activity.operations[0]).toMatchObject({
        category: 'using_tool',
        interrupted: 1,
    });
    const { activity: _activity, ...legacyTurn } = turn;
    expect(agentTurnSummarySchema.parse(legacyTurn).activity).toEqual({ operations: [] });
});

test('Agent configuration carries no factory kind', () => {
    const command = {
        agentDescription: 'Release notes',
        agentId: 'agt_harbor',
        agentName: 'Harbor',
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        runtimeId: 'codex',
        sessionGeneration: 1,
        sessionResetKind: 'session',
        type: 'agent-configure',
    } as const;
    expect(agentCommandSchema.parse(command)).toMatchObject({ type: 'agent-configure' });
    expect(agentCommandSchema.safeParse({ ...command, factoryKind: 'ordinary' }).success).toBe(
        false
    );
});

test('the Computer protocol has no Cove application frame', () => {
    expect(
        agentCommandSchema.safeParse({
            agentDescription: 'Onboarding Assistant',
            agentId: 'agt_harbor',
            agentName: 'Cove',
            applicationId: 'cap_application',
            factoryKind: 'cove',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            sessionGeneration: 1,
            type: 'cove-apply',
        }).success
    ).toBe(false);
});
