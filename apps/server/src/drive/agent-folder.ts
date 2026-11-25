import type { HausDatabase } from '../postgres/connection.ts';
import { agentsByHandle, retiredAgentArea } from './areas.ts';
import { moveAreaFolder } from './project-folder.ts';

export async function archiveRetiredAgentFolder(
    tx: HausDatabase,
    agent: { handle: string; serverId: string }
) {
    const [, previous] = await agentsByHandle(tx, agent.serverId, agent.handle);
    if (!previous) {
        return 0;
    }
    const archive = retiredAgentArea(previous);
    return await moveAreaFolder(tx, {
        area: archive.area,
        from: `agents/${previous.handle}`,
        serverId: agent.serverId,
        to: archive.root,
    });
}
