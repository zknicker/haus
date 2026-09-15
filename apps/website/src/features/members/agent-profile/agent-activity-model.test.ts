import { expect, test } from 'bun:test';
import type {
    AgentActivityEvent,
    AgentExecutionJournal,
    AgentExecutionJournalResult,
} from '@haus/api';
import {
    formatAgentActivityDiagnosticInfo,
    formatAgentActivityEvent,
    getAgentActivityColor,
    getAgentActivityPhaseLabel,
    getTurnJournalPresentation,
    shouldRequestExecutionJournal,
} from './agent-activity-model.ts';

test('formats semantic activity with centralized, safe copy', () => {
    expect(formatAgentActivityEvent(activityEvent({ category: 'checking_messages' }))).toBe(
        'Checking messages…'
    );
    expect(
        formatAgentActivityEvent(activityEvent({ category: 'running_command', phase: 'completed' }))
    ).toBe('Ran a command');
    expect(
        formatAgentActivityEvent(
            activityEvent({ category: 'updating_instructions', phase: 'completed' })
        )
    ).toBe('Updated instructions');
    expect(
        formatAgentActivityEvent(
            activityEvent({ category: 'using_tool', phase: 'failed', toolRef: 'search.web' })
        )
    ).toBe('Failed while using search.web');
});

test('diagnostic copy contains only the Server-safe activity summary', () => {
    const copy = formatAgentActivityDiagnosticInfo([
        activityEvent({
            category: 'using_tool',
            phase: 'completed',
            producer: 'computer',
            producerId: 'computer_private_journal',
            toolRef: 'search.web',
        }),
    ]);

    expect(copy).toContain('Used search.web');
    expect(copy).not.toContain('computer_private_journal');
    expect(copy).not.toContain('run_one');
});

test('activity phases map onto HeroUI Chip presentation', () => {
    expect(getAgentActivityColor('started')).toBe('warning');
    expect(getAgentActivityColor('completed')).toBe('success');
    expect(getAgentActivityColor('failed')).toBe('danger');
    expect(getAgentActivityPhaseLabel('started')).toBe('Active');
    expect(getAgentActivityPhaseLabel('completed')).toBe('Completed');
    expect(getAgentActivityPhaseLabel('failed')).toBe('Failed');
});

test('journal presentation preserves available evidence, including interrupted and reasoning-only turns', () => {
    expect(getTurnJournalPresentation(null, null)).toMatchObject({ kind: 'missing' });

    expect(
        getTurnJournalPresentation(
            {
                agentId: 'agent_one',
                reason: 'offline',
                requestId: 'request_one',
                runId: 'run_one',
                status: 'unavailable',
                type: 'agent-execution-journal-result',
            },
            'run_one'
        )
    ).toMatchObject({ kind: 'offline' });

    expect(
        getTurnJournalPresentation(
            {
                agentId: 'agent_one',
                reason: 'timeout',
                requestId: 'request_one',
                runId: 'run_one',
                status: 'unavailable',
                type: 'agent-execution-journal-result',
            },
            'run_one'
        )
    ).toMatchObject({ kind: 'unavailable', reason: 'timeout' });

    expect(
        getTurnJournalPresentation(
            {
                agentId: 'agent_one',
                reason: 'missing',
                requestId: 'request_one',
                runId: 'run_one',
                status: 'unavailable',
                type: 'agent-execution-journal-result',
            },
            'run_one'
        )
    ).toMatchObject({ kind: 'missing' });

    expect(
        getTurnJournalPresentation(
            availableJournal({
                journal: { status: 'interrupted', tools: [] },
            }),
            'run_one'
        )
    ).toMatchObject({ kind: 'available', journal: { status: 'interrupted' } });

    expect(
        getTurnJournalPresentation(
            availableJournal({
                journal: {
                    status: 'completed',
                    tools: [
                        {
                            startedAt: '2026-08-11T12:00:00.000Z',
                            status: 'completed',
                            toolCallId: 'tool_one',
                            toolName: 'search',
                        },
                    ],
                },
            }),
            'run_one'
        )
    ).toMatchObject({ kind: 'available' });
    expect(
        getTurnJournalPresentation(
            availableJournal({
                journal: {
                    status: 'running',
                    tools: [],
                    reasoning: [
                        {
                            id: 'thought',
                            startedAt: '2026-08-11T12:00:00.000Z',
                            text: 'Checking the current state.',
                        },
                    ],
                },
            }),
            'run_one'
        )
    ).toMatchObject({ kind: 'available' });
});

test('execution journal requests require an explicit privileged open and real run id', () => {
    expect(shouldRequestExecutionJournal({ access: 'summary', open: true, runId: 'run_one' })).toBe(
        false
    );
    expect(
        shouldRequestExecutionJournal({ access: 'journal', open: false, runId: 'run_one' })
    ).toBe(false);
    expect(shouldRequestExecutionJournal({ access: 'journal', open: true, runId: null })).toBe(
        false
    );
    expect(shouldRequestExecutionJournal({ access: 'journal', open: true, runId: 'run_one' })).toBe(
        true
    );
});

function activityEvent(overrides: Partial<AgentActivityEvent> = {}): AgentActivityEvent {
    return {
        agentId: 'agent_one',
        category: 'working',
        id: 'event_one',
        occurredAt: '2026-08-11T12:00:00.000Z',
        phase: 'started',
        position: 1,
        producer: 'server',
        producerId: 'server_one',
        producerSequence: 1,
        runId: 'run_one',
        serverId: 'server_one',
        ...overrides,
    };
}

function availableJournal(
    overrides: { journal?: Partial<AgentExecutionJournal> } = {}
): AgentExecutionJournalResult {
    const journal = overrides.journal ?? {};
    return {
        agentId: 'agent_one',
        journal: {
            ...journal,
            endedAt: journal.endedAt ?? '2026-08-11T12:01:00.000Z',
            runId: 'run_one',
            startedAt: '2026-08-11T12:00:00.000Z',
            status: journal.status ?? 'completed',
            tools: journal.tools ?? [],
        } as AgentExecutionJournal,
        requestId: 'request_one',
        runId: 'run_one',
        status: 'available',
        type: 'agent-execution-journal-result',
    };
}
