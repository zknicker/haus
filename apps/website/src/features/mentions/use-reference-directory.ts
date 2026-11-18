import * as React from 'react';

import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { useChatAppearances } from '../../hooks/servers/use-chats.ts';
import { useHumanDirectory } from '../../hooks/servers/use-human-directory.ts';
import type { ReferenceDirectory } from './reference-mentions.ts';

/**
 * The directory `readReferenceMentions` reads, for a surface outside a
 * transcript. Every read is a Server-wide list the App already holds, so
 * rendering references fans out nothing per chip.
 */
export function useReferenceDirectory(serverId: string): ReferenceDirectory {
    const agents = useAgentAppearances(serverId);
    const chatsById = useChatAppearances(serverId);
    const humans = useHumanDirectory(serverId);
    const agentsById = React.useMemo(
        () => new Map(agents.map((agent) => [agent.id, agent])),
        [agents]
    );
    return React.useMemo(
        () => ({ agentsById, chatsById, humans }),
        [agentsById, chatsById, humans]
    );
}
