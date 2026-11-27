import {
    type AgentInboxItem,
    composeCrewFinishInput,
    composeDriveConflictInput,
    composeInboxDrain,
    composeInboxNotice,
    composeIssueAssignmentInput,
    composeIssueEventInput,
    composeProcessExitInput,
    composeTurnContent,
    composeUnknownToolCalls,
} from '@haus/agent-prompt';
import type { AgentStartCommand, RunnerSessionPolicy } from '@haus/api';

export interface TurnSessionView {
    readonly isColdStart: boolean;
    readonly resumesInterruptedTurn: boolean;
    readonly sessionGeneration: number;
    readonly sessionKind: 'captain' | 'task' | null;
}

export interface TurnInput {
    readonly drained: readonly AgentInboxItem[];
    readonly notice: string | null;
    readonly turnContent: string;
}

export function sessionKindOf(policy: RunnerSessionPolicy | null) {
    return policy?.kind ?? null;
}

export function composeTurnInput(
    start: AgentStartCommand,
    session: TurnSessionView,
    unknownToolCallIds: readonly string[]
) {
    const input = composeOpening(start, session);
    const unknown = composeUnknownToolCalls(unknownToolCallIds);
    return unknown ? { ...input, turnContent: `${unknown}\n\n${input.turnContent}` } : input;
}

function composeOpening(start: AgentStartCommand, session: TurnSessionView) {
    const chatlessBody = composeChatlessBody(start, session.sessionKind);
    if (chatlessBody) {
        const input: TurnInput = {
            drained: [],
            notice: null,
            turnContent: composeTurnContent(session, {
                body: chatlessBody,
                greets: false,
                unreadElsewhere: [],
            }),
        };
        return input;
    }
    const drainable = new Set(
        session.isColdStart
            ? start.drainItemIds
            : [...start.drainItemIds, ...start.warmDrainItemIds]
    );
    const inbox: AgentInboxItem[] = start.inbox;
    const drained = inbox.filter((item) => drainable.has(item.id));
    const withheld = inbox.filter((item) => !drainable.has(item.id));
    const notice = composeInboxNotice(
        withheld,
        Math.max(withheld.length, start.totalPending - drained.length)
    );
    const body =
        drained.length > 0
            ? [composeInboxDrain(drained), notice].filter(Boolean).join('\n\n')
            : notice;
    const input: TurnInput = {
        drained,
        notice,
        turnContent: composeTurnContent(session, {
            body,
            greets: start.greets === true,
            unreadElsewhere: start.unreadElsewhere,
        }),
    };
    return input;
}

function composeChatlessBody(
    start: AgentStartCommand,
    sessionKind: TurnSessionView['sessionKind']
) {
    if (start.crewFinishes) {
        return composeCrewFinishInput(start.crewFinishes);
    }
    if (start.issueAssignments) {
        return composeIssueAssignmentInput(start.issueAssignments, sessionKind);
    }
    if (start.issueEvents) {
        return composeIssueEventInput(start.issueEvents);
    }
    if (start.processExit) {
        return composeProcessExitInput(start.processExit);
    }
    return start.driveConflict
        ? composeDriveConflictInput(start.driveConflict, start.agentName)
        : null;
}
