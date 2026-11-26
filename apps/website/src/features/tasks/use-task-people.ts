import type { TaskActor } from '@haus/api';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../hooks/servers/use-human-directory.ts';

/** Someone a Task can name: a person or an Agent, read the same way. */
export interface TaskPerson {
    avatarUrl: null | string;
    label: string;
}

/** One Task actor's name and face, resolved even when they left the Server. */
export function useTaskActor(serverId: string, actor: TaskActor | null): null | TaskPerson {
    const agents = useAgentAppearances(serverId);
    const humans = useHumanDirectory(serverId);
    if (!actor) {
        return null;
    }
    if (actor.kind === 'user') {
        return { avatarUrl: humans.avatarUrl(actor.userId), label: humans.name(actor.userId) };
    }
    const agent = agents.find((candidate) => candidate.id === actor.agentId);
    return {
        avatarUrl: agent?.avatarUrl ?? null,
        label: agent?.displayName ?? `Captain ${actor.agentId.slice(-6)}`,
    };
}
