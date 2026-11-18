import * as React from 'react';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../hooks/servers/use-human-directory.ts';
import { type ArtifactCreatorDirectory, artifactCreatorDirectory } from './artifact-creators.ts';

/** Names creators from the Agent and member lists the shell already holds. */
export function useArtifactCreatorDirectory(serverId: string): ArtifactCreatorDirectory {
    const agents = useAgentAppearances(serverId);
    const humans = useHumanDirectory(serverId);
    return React.useMemo(() => artifactCreatorDirectory(agents, humans), [agents, humans]);
}
