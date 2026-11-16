import type { TaskActor } from '@haus/api';
import * as React from 'react';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../hooks/servers/use-human-directory.ts';
import { useMembers } from '../../hooks/servers/use-members.ts';
import { humanDisplayName } from '../servers/human-identity.ts';
import { assigneeKey } from './board-view.ts';

/** Someone a Task can name: a person or an Agent, read the same way. */
export interface TaskPerson {
    avatarUrl: null | string;
    /** `assigneeKey` of this person. */
    key: string;
    label: string;
}

/** Everyone a Task can be assigned to: the Server's Agents, then its people. */
export function useTaskPeople(serverId: string): readonly TaskPerson[] {
    const agents = useAgentAppearances(serverId);
    const members = useMembers(serverId).data?.members;
    return React.useMemo(
        () => [
            ...agents.map((agent) => ({
                avatarUrl: agent.avatarUrl,
                key: assigneeKey({ agentId: agent.id, kind: 'agent' }),
                label: agent.displayName,
            })),
            ...(members ?? []).map((member) => ({
                avatarUrl: member.avatarUrl ?? null,
                key: assigneeKey({ kind: 'user', userId: member.userId }),
                label: humanDisplayName(member),
            })),
        ],
        [agents, members]
    );
}

/** One Task actor's name and face, resolved even when they left the Server. */
export function useTaskActor(serverId: string, actor: TaskActor | null): null | TaskPerson {
    const agents = useAgentAppearances(serverId);
    const humans = useHumanDirectory(serverId);
    if (!actor) {
        return null;
    }
    if (actor.kind === 'user') {
        return {
            avatarUrl: humans.avatarUrl(actor.userId),
            key: assigneeKey(actor),
            label: humans.name(actor.userId),
        };
    }
    const agent = agents.find((candidate) => candidate.id === actor.agentId);
    return {
        avatarUrl: agent?.avatarUrl ?? null,
        key: assigneeKey(actor),
        label: agent?.displayName ?? `Agent ${actor.agentId.slice(-6)}`,
    };
}
