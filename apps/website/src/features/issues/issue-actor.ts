import type { IssueActor } from '@haus/api';
import * as React from 'react';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../hooks/servers/use-human-directory.ts';
import { useMembers } from '../../hooks/servers/use-members.ts';
import { useTasksById } from '../../hooks/tasks/use-tasks-by-id.ts';
import { humanDisplayName } from '../servers/human-identity.ts';

export interface IssuePerson {
    avatarUrl: null | string;
    key: string;
    label: string;
}

export const unassignedKey = 'none';

export function issueActorKey(actor: IssueActor | null) {
    if (!actor) {
        return unassignedKey;
    }
    switch (actor.kind) {
        case 'user':
            return `user:${actor.userId}`;
        case 'captain':
            return `captain:${actor.agentId}`;
        case 'task':
            return `task:${actor.taskId}`;
    }
}

export function issueActorFromKey(key: string) {
    const actor: IssueActor | null = actorOf(key);
    return actor;
}

function actorOf(key: string) {
    const [kind, id] = key.split(':');
    if (!id) {
        return null;
    }
    switch (kind) {
        case 'user':
            return { kind, userId: id } as const;
        case 'captain':
            return { agentId: id, kind } as const;
        case 'task':
            return { kind, taskId: id } as const;
        default:
            return null;
    }
}

export function useIssueActor(serverId: string, actor: IssueActor | null) {
    const agents = useAgentAppearances(serverId);
    const humans = useHumanDirectory(serverId);
    const tasks = useTasksById(serverId, { enabled: actor?.kind === 'task' });
    if (!actor) {
        return null;
    }
    const key = issueActorKey(actor);
    switch (actor.kind) {
        case 'user':
            return {
                avatarUrl: humans.avatarUrl(actor.userId),
                key,
                label: humans.name(actor.userId),
            };
        case 'captain': {
            const agent = agents.find((candidate) => candidate.id === actor.agentId);
            return {
                avatarUrl: agent?.avatarUrl ?? null,
                key,
                label: agent?.displayName ?? `Captain ${actor.agentId.slice(-6)}`,
            } satisfies IssuePerson;
        }
        case 'task':
            return {
                avatarUrl: null,
                key,
                label: tasks.get(actor.taskId)?.title ?? 'Task',
            } satisfies IssuePerson;
    }
}

export function useIssueAssigneeChoices(serverId: string) {
    const agents = useAgentAppearances(serverId);
    const members = useMembers(serverId).data?.members;
    return React.useMemo(
        () => [
            ...agents.map((agent) => ({
                avatarUrl: agent.avatarUrl,
                key: issueActorKey({ agentId: agent.id, kind: 'captain' }),
                label: agent.displayName,
            })),
            ...(members ?? []).map((member) => ({
                avatarUrl: member.avatarUrl ?? null,
                key: issueActorKey({ kind: 'user', userId: member.userId }),
                label: humanDisplayName(member),
            })),
        ],
        [agents, members]
    );
}
