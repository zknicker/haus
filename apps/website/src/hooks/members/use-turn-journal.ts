import * as React from 'react';
import {
    shouldRequestExecutionJournal,
    type TurnDetailAccess,
} from '../../features/members/agent-profile/agent-activity-model.ts';
import { hausTrpc, useHausServerConnectionState } from '../../lib/haus-server.tsx';
import { useAgentActivityListener } from '../agents/use-current-agent-activity.tsx';
import {
    createTurnJournalRelay,
    emptyTurnJournal,
    type TurnJournalSnapshot,
} from './turn-journal-relay.ts';

/** Detailed evidence stays in this open view, outside the persisted query cache. */
export function useTurnJournal(input: {
    access: TurnDetailAccess;
    agentId: string | null;
    enabled: boolean;
    live: boolean;
    runId: string | null;
    serverId: string;
}): TurnJournalSnapshot {
    const { access, agentId, enabled, live, runId, serverId } = input;
    const utils = hausTrpc.useUtils();
    const allowed =
        shouldRequestExecutionJournal({ access, open: enabled, runId }) && Boolean(agentId);
    const scope = JSON.stringify([serverId, agentId, runId, allowed]);
    const [state, setState] = React.useState({ scope, snapshot: emptyTurnJournal });
    const relay = React.useRef<ReturnType<typeof createTurnJournalRelay> | null>(null);

    React.useEffect(() => {
        setState({ scope, snapshot: emptyTurnJournal });
        if (!(allowed && agentId && runId)) {
            return;
        }
        const current = createTurnJournalRelay({
            read: () => utils.client.agent.executionJournal.query({ agentId, runId, serverId }),
            runId,
            publish: (snapshot) => setState({ scope, snapshot }),
        });
        relay.current = current;
        void current.refresh();
        return () => {
            current.dispose();
            relay.current = null;
        };
    }, [agentId, allowed, runId, scope, serverId, utils]);

    React.useEffect(() => {
        if (!allowed) {
            return;
        }
        // Settlement gets a final read even when its activity subscription closes first.
        if (!live) {
            void relay.current?.refresh();
            return;
        }
        // Reasoning deltas have no semantic Server event. Refresh only an open live view.
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                void relay.current?.refresh();
            }
        }, 1000);
        return () => window.clearInterval(timer);
    }, [allowed, live]);

    useAgentActivityListener((event) => {
        if (allowed && event.agentId === agentId && event.runId === runId) {
            void relay.current?.refresh();
        }
    });

    // A websocket gap may have hidden journal changes; the first connection has not.
    const connection = useHausServerConnectionState();
    const previousConnection = React.useRef(connection);
    React.useEffect(() => {
        const previous = previousConnection.current;
        previousConnection.current = connection;
        if (allowed && connection === 'connected' && previous === 'reconnecting') {
            void relay.current?.refresh();
        }
    }, [allowed, connection]);

    return allowed && state.scope === scope ? state.snapshot : emptyTurnJournal;
}
