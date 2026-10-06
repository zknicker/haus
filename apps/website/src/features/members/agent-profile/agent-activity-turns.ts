import type {
    AgentActivityCategory,
    AgentActivityEvent,
    AgentActivityPhase,
    AgentTurn,
    AgentTurnOperationCategory,
    AgentTurnOperationCount,
    AgentTurnTrigger,
} from '@haus/api';

const operationCategories = new Set<AgentActivityCategory>([
    'browsing',
    'checking_messages',
    'editing_files',
    'reading_files',
    'running_command',
    'searching_web',
    'updating_instructions',
    'using_tool',
]);

interface ActivityTurnBase {
    readonly durationMs: number;
    readonly events: readonly AgentActivityEvent[];
    readonly messageCount: number;
    readonly operationCount: number;
    readonly operations: readonly AgentTurnOperationCount[];
    readonly runId: string;
    readonly startedAt: string;
    /** What woke the turn; known once the Server settles it. */
    readonly trigger: AgentTurnTrigger | null;
}

export type AgentActivityTurn =
    | (ActivityTurnBase & {
          readonly kind: 'active';
      })
    | (ActivityTurnBase & {
          readonly endedAt: string;
          readonly failureKind: string | null;
          readonly kind: 'settled';
          readonly outputProduced: boolean;
          readonly status: 'completed' | 'failed' | 'interrupted';
      });

export function groupAgentActivityTurns(
    events: readonly AgentActivityEvent[],
    settledTurns: readonly AgentTurn[],
    now = Date.now()
): AgentActivityTurn[] {
    const eventGroups = new Map<string, AgentActivityEvent[]>();
    for (const event of events) {
        const group = eventGroups.get(event.runId) ?? [];
        group.push(event);
        eventGroups.set(event.runId, group);
    }
    const settledByRunId = new Map(settledTurns.map((turn) => [turn.runId, turn]));
    const runIds = new Set([...eventGroups.keys(), ...settledByRunId.keys()]);

    return [...runIds]
        .map<AgentActivityTurn>((runId) => {
            const groupedEvents = eventGroups.get(runId) ?? [];
            const orderedEvents = [...groupedEvents].sort(
                (left, right) => left.position - right.position
            );
            const settled = settledByRunId.get(runId);
            const terminal = findTerminalWorkingEvent(orderedEvents);
            const startedAt =
                settled?.startedAt ?? orderedEvents[0]?.occurredAt ?? new Date(now).toISOString();
            const messageCount =
                settled?.messageCount ??
                orderedEvents.filter(
                    (event) => event.category === 'sending_message' && event.phase === 'completed'
                ).length;
            const operations =
                settled?.activity.operations ?? aggregateEventOperations(orderedEvents);
            const base: ActivityTurnBase = {
                durationMs: durationBetween(
                    startedAt,
                    settled?.endedAt ?? terminal?.occurredAt,
                    now
                ),
                events: orderedEvents,
                messageCount,
                operationCount: operations.reduce(
                    (total, operation) =>
                        total + operation.completed + operation.failed + operation.interrupted,
                    0
                ),
                operations,
                runId,
                startedAt,
                trigger: settled?.trigger ?? null,
            };

            if (!(settled || terminal)) {
                return { ...base, kind: 'active' };
            }

            return {
                ...base,
                endedAt: settled?.endedAt ?? terminal?.occurredAt ?? startedAt,
                failureKind: settled?.failureKind ?? null,
                kind: 'settled',
                outputProduced: settled?.outputProduced ?? messageCount > 0,
                status:
                    settled?.status ??
                    (terminal?.phase === 'failed'
                        ? 'failed'
                        : terminal?.phase === 'interrupted'
                          ? 'interrupted'
                          : 'completed'),
            };
        })
        .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
}

/** One turn's start, at the density both the journal and its summary rows use. */
export function formatActivityTurnTime(value: string): string {
    return new Date(value).toLocaleString([], {
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
    });
}

export function formatActivityTurnDuration(durationMs: number): string {
    const seconds = Math.max(0, Math.round(durationMs / 1000));
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

export function formatActivityTurnHeadline(turn: AgentActivityTurn): string {
    const duration = formatActivityTurnDuration(turn.durationMs);
    if (turn.kind === 'active') {
        return `Working for ${duration}`;
    }
    if (turn.status === 'failed') {
        return `Failed after ${duration}`;
    }
    if (turn.status === 'interrupted') {
        return `Interrupted after ${duration}`;
    }
    if (!(turn.outputProduced || turn.messageCount > 0)) {
        return `Completed silently in ${duration}`;
    }
    return `Completed in ${duration}`;
}

export function formatActivityTurnCounts(turn: AgentActivityTurn): string {
    const operations = turn.operations.map(formatOperationCount);
    return [
        ...(operations.length > 0 ? operations : ['No recorded operations']),
        `${turn.messageCount} ${pluralize(turn.messageCount, 'message')}`,
    ].join(' · ');
}

export function getActivityTurnPhase(turn: AgentActivityTurn): AgentActivityPhase {
    if (turn.kind === 'active') {
        return 'started';
    }
    return turn.status;
}

function durationBetween(startedAt: string, endedAt: string | undefined, now: number): number {
    return Math.max(0, (endedAt ? Date.parse(endedAt) : now) - Date.parse(startedAt));
}

function aggregateEventOperations(
    events: readonly AgentActivityEvent[]
): AgentTurnOperationCount[] {
    const counts = new Map<AgentTurnOperationCategory, AgentTurnOperationCount>();
    for (const event of events) {
        if (!(operationCategories.has(event.category) && event.phase !== 'started')) {
            continue;
        }
        const category = event.category as AgentTurnOperationCategory;
        const count = counts.get(category) ?? {
            category,
            completed: 0,
            failed: 0,
            interrupted: 0,
        };
        count[event.phase] += 1;
        counts.set(category, count);
    }
    return [...counts.values()];
}

function isTerminalWorkingEvent(event: AgentActivityEvent): boolean {
    return event.category === 'working' && event.phase !== 'started';
}

function findTerminalWorkingEvent(
    events: readonly AgentActivityEvent[]
): AgentActivityEvent | undefined {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event && isTerminalWorkingEvent(event)) {
            return event;
        }
    }
    return undefined;
}

function pluralize(count: number, singular: string): string {
    return count === 1 ? singular : `${singular}s`;
}

const operationLabels: Record<AgentTurnOperationCategory, [string, string]> = {
    browsing: ['browser action', 'browser actions'],
    checking_messages: ['message check', 'message checks'],
    delegating: ['sub-agent', 'sub-agents'],
    editing_files: ['file edit', 'file edits'],
    generating_media: ['image or video generated', 'images or videos generated'],
    reading_files: ['file read', 'file reads'],
    running_command: ['command', 'commands'],
    searching_web: ['web search', 'web searches'],
    updating_instructions: ['instruction update', 'instruction updates'],
    using_tool: ['tool call', 'tool calls'],
};

function formatOperationCount(operation: AgentTurnOperationCount): string {
    const total = operation.completed + operation.failed + operation.interrupted;
    const label = operationLabels[operation.category][total === 1 ? 0 : 1];
    const exceptions = [
        operation.failed > 0 ? `${operation.failed} failed` : null,
        operation.interrupted > 0 ? `${operation.interrupted} interrupted` : null,
    ].filter(Boolean);
    return `${total} ${label}${exceptions.length > 0 ? ` (${exceptions.join(', ')})` : ''}`;
}
