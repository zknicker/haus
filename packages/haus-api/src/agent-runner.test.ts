import { expect, test } from 'bun:test';
import {
    agentCommandSchema,
    agentTurnSummarySchema,
    coveApplyResultSchema,
} from './agent-runner.ts';

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

test('Cove application uses one explicit factory command and durable result', () => {
    const command = {
        agentDescription: 'Onboarding Assistant',
        agentId: 'agt_cove',
        agentName: 'Cove',
        applicationId: 'cap_application',
        factoryKind: 'cove',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        sessionGeneration: 1,
        type: 'cove-apply',
    } as const;
    expect(agentCommandSchema.parse(command)).toEqual(command);
    expect(agentCommandSchema.safeParse({ ...command, archetype: 'operator' }).success).toBe(false);
    expect(
        coveApplyResultSchema.parse({
            agentId: command.agentId,
            applicationId: command.applicationId,
            factoryKind: 'cove',
            status: 'applied',
            type: 'cove-apply-result',
        })
    ).toMatchObject({ status: 'applied' });
});

test('ordinary configuration replay preserves Cove factory identity', () => {
    expect(
        agentCommandSchema.parse({
            agentDescription: 'Onboarding Assistant',
            agentId: 'agt_cove',
            agentName: 'Cove',
            factoryKind: 'cove',
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'medium',
            runtimeId: 'codex',
            sessionGeneration: 1,
            sessionResetKind: 'session',
            type: 'agent-configure',
        })
    ).toMatchObject({ factoryKind: 'cove', type: 'agent-configure' });
});
