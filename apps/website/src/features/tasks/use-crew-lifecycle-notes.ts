import type { Chat } from '@haus/api';
import * as React from 'react';
import { useCrewLifecycle } from '../../hooks/tasks/use-crew-lifecycle.ts';
import type { TimelineNote } from '../servers/chat/timeline-notes.ts';
import { crewLifecycleNotes } from './crew-lifecycle-notes.ts';
import { useTaskIssueCodes } from './use-task-facts.ts';

const noNotes: readonly TimelineNote[] = [];

export function useCrewLifecycleNotes(chat: Pick<Chat, 'kind' | 'peerAgentId' | 'serverId'>) {
    const { serverId } = chat;
    const captainId = chat.kind === 'captain' ? chat.peerAgentId : null;
    const lifecycle = useCrewLifecycle(serverId, captainId);
    const codes = useTaskIssueCodes(serverId, { enabled: captainId !== null });
    return React.useMemo(() => {
        const notes = lifecycle ? crewLifecycleNotes(lifecycle, codes) : noNotes;
        return notes.length > 0 ? notes : noNotes;
    }, [codes, lifecycle]);
}
