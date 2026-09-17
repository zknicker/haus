import type { AgentExecutionJournalResult } from '@haus/api';
import {
    getTurnJournalPresentation,
    type TurnJournalPresentation,
} from '../../features/members/agent-profile/agent-activity-model.ts';

export interface TurnJournalSnapshot {
    isPending: boolean;
    presentation: TurnJournalPresentation | null;
    refreshError: string | null;
}

export const emptyTurnJournal: TurnJournalSnapshot = {
    isPending: true,
    presentation: null,
    refreshError: null,
};

/** One scoped relay, one in-flight read, and one trailing refresh for an event burst. */
export function createTurnJournalRelay(input: {
    read: () => Promise<AgentExecutionJournalResult>;
    runId: string;
    publish: (snapshot: TurnJournalSnapshot) => void;
}) {
    let disposed = false;
    let pending = false;
    let dirty = false;
    let snapshot = emptyTurnJournal;

    async function refresh() {
        if (disposed) {
            return;
        }
        if (pending) {
            dirty = true;
            return;
        }
        pending = true;
        do {
            dirty = false;
            let presentation: TurnJournalPresentation;
            try {
                presentation = getTurnJournalPresentation(await input.read(), input.runId);
            } catch {
                presentation = {
                    description: 'The Computer did not return detailed activity.',
                    kind: 'unavailable',
                    reason: 'timeout',
                    title: 'Detailed activity unavailable',
                };
            }
            if (disposed) {
                return;
            }
            snapshot =
                presentation.kind !== 'available' && snapshot.presentation?.kind === 'available'
                    ? {
                          ...snapshot,
                          refreshError: `${presentation.description} Showing the last received activity.`,
                      }
                    : { isPending: false, presentation, refreshError: null };
            input.publish(snapshot);
        } while (dirty);
        pending = false;
    }

    return {
        refresh,
        dispose() {
            disposed = true;
        },
    };
}
