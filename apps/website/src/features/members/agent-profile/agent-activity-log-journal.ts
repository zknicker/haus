import * as React from 'react';
import { useTurnJournal } from '../../../hooks/members/use-turn-journal.ts';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { useActivityLogStores, useJournalAdmission } from './agent-activity-log-stores.ts';
import {
    getTurnJournalPresentation,
    type TurnDetailAccess,
    type TurnJournalPresentation,
} from './agent-activity-model.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';

/** A settled journal never changes; keep it while the log is in use, then let it go. */
const settledJournalGcMs = 30 * 60_000;

/**
 * One turn's journal for the log. A running
 * turn streams through the live relay; a settled turn is an immutable record,
 * read once into the query cache and never refetched, so collapsing,
 * reopening, scrolling away and back, or revisiting the tab costs nothing.
 * Every first read waits its turn in the log's queue (at most 3 in flight).
 */
export function useLogTurnJournal({
    access,
    agentId,
    isOpen,
    serverId,
    turn,
}: {
    access: TurnDetailAccess;
    agentId: string;
    isOpen: boolean;
    serverId: string;
    turn: AgentActivityTurn;
}): TurnJournalPresentation | null {
    const { queue } = useActivityLogStores();
    const isLive = turn.kind === 'active';
    const input = { agentId, runId: turn.runId, serverId };
    const utils = hausTrpc.useUtils();
    const isCached = !isLive && utils.agent.executionJournal.getData(input) !== undefined;
    const isAdmitted = useJournalAdmission(turn.runId, isOpen && access === 'journal' && !isCached);

    const settled = hausTrpc.agent.executionJournal.useQuery(input, {
        enabled: access === 'journal' && !isLive && isAdmitted,
        gcTime: settledJournalGcMs,
        refetchOnReconnect: false,
        retry: false,
        // Only an available journal is final; an offline or timed-out answer
        // reads again the next time someone opens the turn.
        staleTime: (query) =>
            query.state.data?.status === 'available' ? Number.POSITIVE_INFINITY : 0,
    });
    const live = useTurnJournal({
        access,
        agentId,
        enabled: isLive && isAdmitted,
        // Closed, the overview's marks still follow activity events; only an
        // open turn polls each second for reasoning.
        live: isOpen,
        runId: turn.runId,
        serverId,
    });

    const presentation = isLive
        ? live.presentation
        : settled.data
          ? getTurnJournalPresentation(settled.data, turn.runId)
          : settled.isError
            ? unavailable
            : null;
    const isSettled = presentation !== null;
    React.useEffect(() => {
        if (isSettled) {
            queue.settle(turn.runId);
        }
    }, [isSettled, queue, turn.runId]);
    return presentation;
}

const unavailable: TurnJournalPresentation = {
    description: 'The Computer did not return detailed activity.',
    kind: 'unavailable',
    reason: 'timeout',
    title: 'Detailed activity unavailable',
};
