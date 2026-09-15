import type {
    AgentActivityCategory,
    AgentActivityEvent,
    AgentActivityPhase,
    AgentExecutionJournalResult,
} from '@haus/api';

type ActivityCopy = Record<AgentActivityPhase, string>;

const activityCopy: Record<AgentActivityCategory, ActivityCopy> = {
    browsing: {
        completed: 'Browsed',
        failed: 'Failed while browsing',
        interrupted: 'Browsing was interrupted',
        started: 'Browsing…',
    },
    checking_messages: {
        completed: 'Checked messages',
        failed: 'Failed to check messages',
        interrupted: 'Message check was interrupted',
        started: 'Checking messages…',
    },
    editing_files: {
        completed: 'Edited files',
        failed: 'Failed to edit files',
        interrupted: 'File editing was interrupted',
        started: 'Editing files…',
    },
    reading_files: {
        completed: 'Read files',
        failed: 'Failed to read files',
        interrupted: 'File reading was interrupted',
        started: 'Reading files…',
    },
    running_command: {
        completed: 'Ran a command',
        failed: 'Failed to run a command',
        interrupted: 'Command was interrupted',
        started: 'Running a command…',
    },
    searching_web: {
        completed: 'Searched the web',
        failed: 'Failed to search the web',
        interrupted: 'Web search was interrupted',
        started: 'Searching the web…',
    },
    sending_message: {
        completed: 'Sent a message',
        failed: 'Failed to send a message',
        interrupted: 'Message send was interrupted',
        started: 'Sending a message…',
    },
    starting_work: {
        completed: 'Started work',
        failed: 'Failed to start work',
        interrupted: 'Starting work was interrupted',
        started: 'Starting work…',
    },
    thinking: {
        completed: 'Thought',
        failed: 'Failed while thinking',
        interrupted: 'Thinking was interrupted',
        started: 'Thinking…',
    },
    updating_instructions: {
        completed: 'Updated instructions',
        failed: 'Failed to update instructions',
        interrupted: 'Instruction update was interrupted',
        started: 'Updating instructions…',
    },
    using_tool: {
        completed: 'Used a tool',
        failed: 'Failed while using a tool',
        interrupted: 'Tool use was interrupted',
        started: 'Using a tool…',
    },
    working: {
        completed: 'Worked',
        failed: 'Failed while working',
        interrupted: 'Work was interrupted',
        started: 'Working…',
    },
};

export type ActivityColor = 'danger' | 'success' | 'warning';

export function formatAgentActivityEvent(event: AgentActivityEvent): string {
    const copy = activityCopy[event.category][event.phase];
    if (event.category !== 'using_tool' || !event.toolRef) {
        return copy;
    }

    const toolCopy = {
        completed: `Used ${event.toolRef}`,
        failed: `Failed while using ${event.toolRef}`,
        interrupted: `${event.toolRef} was interrupted`,
        started: `Using ${event.toolRef}…`,
    } satisfies ActivityCopy;

    return toolCopy[event.phase];
}

export function formatAgentActivityDiagnosticInfo(events: readonly AgentActivityEvent[]): string {
    return events
        .map((event) => `${event.occurredAt} · ${formatAgentActivityEvent(event)}`)
        .join('\n');
}

export function getAgentActivityColor(phase: AgentActivityPhase): ActivityColor {
    if (phase === 'failed') {
        return 'danger';
    }
    if (phase === 'started' || phase === 'interrupted') {
        return 'warning';
    }
    return 'success';
}

export function getAgentActivityPhaseLabel(phase: AgentActivityPhase) {
    if (phase === 'failed') {
        return 'Failed';
    }
    if (phase === 'started') {
        return 'Active';
    }
    if (phase === 'interrupted') {
        return 'Interrupted';
    }
    return 'Completed';
}

export type TurnJournalPresentation =
    | {
          description: string;
          kind: 'missing';
          title: string;
      }
    | {
          description: string;
          kind: 'offline';
          title: string;
      }
    | {
          description: string;
          kind: 'unavailable';
          reason: 'timeout';
          title: string;
      }
    | {
          journal: Extract<AgentExecutionJournalResult, { status: 'available' }>['journal'];
          kind: 'available';
      };

export function getTurnJournalPresentation(
    result: AgentExecutionJournalResult | null,
    requestedRunId: string | null
): TurnJournalPresentation {
    if (!(requestedRunId && result) || result.runId !== requestedRunId) {
        return {
            description: 'This message has no available Server turn identity.',
            kind: 'missing',
            title: 'Turn details unavailable',
        };
    }

    if (result.status === 'unavailable') {
        if (result.reason === 'missing') {
            return {
                description: 'The detailed execution record is no longer available.',
                kind: 'missing',
                title: 'Turn details unavailable',
            };
        }
        if (result.reason === 'offline') {
            return {
                description: 'The assigned Computer is offline. Try again when it is online.',
                kind: 'offline',
                title: 'Detailed activity unavailable offline',
            };
        }
        return {
            description: 'The Computer did not return detailed activity in time.',
            kind: 'unavailable',
            reason: 'timeout',
            title: 'Detailed activity unavailable',
        };
    }

    return { journal: result.journal, kind: 'available' };
}

export type TurnDetailAccess = 'journal' | 'summary';

/** Members read the semantic summary; owners and admins may read the journal. */
export function getTurnDetailAccess(role: string): TurnDetailAccess {
    return role === 'member' ? 'summary' : 'journal';
}

export function shouldRequestExecutionJournal(input: {
    access: TurnDetailAccess;
    open: boolean;
    runId: string | null;
}): boolean {
    return input.open && input.access === 'journal' && input.runId !== null;
}
