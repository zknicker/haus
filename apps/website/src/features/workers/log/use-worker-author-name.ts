import type { WorkerTurnInput } from '@haus/api';
import { useAgentAppearances } from '../../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { workerAgentFallbackName } from '../worker-presentation.ts';

export function useWorkerAuthorName(serverId: string) {
    const agents = useAgentAppearances(serverId);
    const humans = useHumanDirectory(serverId);
    return (author: WorkerTurnInput['author']) =>
        author.kind === 'agent'
            ? (agents.find((agent) => agent.id === author.id)?.displayName ??
              workerAgentFallbackName(author.id))
            : humans.name(author.id);
}
