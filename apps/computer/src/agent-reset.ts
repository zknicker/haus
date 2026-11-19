import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
    ensureAgentWorkspace,
    exists,
    resetWorkspaceContents,
    workspaceVolumePaths,
} from './workspace-volumes/workspace-volume.ts';

/**
 * Applies reset semantics inside exactly one Server/Agent filesystem partition. A full reset
 * keeps the Drive folder: memory, notes and skills live in Drive, and the next launch finds
 * them there instead of reseeding.
 */
export async function resetAgentState(input: {
    agentId: string;
    dataRoot: string;
    kind: 'full' | 'session';
    serverId: string;
}): Promise<void> {
    const agentRoot = join(input.dataRoot, 'servers', input.serverId, 'agents', input.agentId);
    if (input.kind === 'full') {
        if (await exists(workspaceVolumePaths(agentRoot).manifest)) {
            await ensureAgentWorkspace({ agentRoot, dataRoot: input.dataRoot });
        }
        await resetWorkspaceContents(agentRoot);
        await Promise.all(
            ['home', 'runtime', 'skills', '.agent-runs', 'session.json'].map((entry) =>
                rm(join(agentRoot, entry), { force: true, recursive: true })
            )
        );
        return;
    }
    await Promise.all([
        rm(join(agentRoot, 'session.json'), { force: true }),
        rm(join(agentRoot, '.agent-runs'), { force: true, recursive: true }),
        rm(join(agentRoot, 'runtime', 'inbox'), { force: true, recursive: true }),
        rm(join(agentRoot, 'runtime', 'pending-notice.json'), { force: true }),
    ]);
}
