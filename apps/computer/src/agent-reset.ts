import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { legacyRoots } from './drive-migration/drive-sources.ts';
import { hasDriveSeedReceipt } from './drive-migration/prepare-agent-drive.ts';
import {
    ensureAgentWorkspace,
    exists,
    resetWorkspaceContents,
    workspaceVolumePaths,
} from './workspace-volumes/workspace-volume.ts';

/**
 * Applies reset semantics inside exactly one Server/Agent filesystem partition. A full reset
 * keeps the Drive folder and refused Drive files. Until the Drive migration completes it also
 * keeps the legacy memory, notes, pages and skills, so a file that never reached Drive survives
 * and the next launch moves it.
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
        const workspace = workspaceVolumePaths(agentRoot).path;
        const kept = new Set([
            join(workspace, 'drive'),
            join(workspace, 'drive-refused'),
            ...((await hasDriveSeedReceipt(agentRoot))
                ? []
                : Object.values(legacyRoots(agentRoot))),
        ]);
        await resetWorkspaceContents(agentRoot, kept);
        await Promise.all(
            ['home', 'runtime', 'skills', '.agent-runs', 'session.json']
                .map((entry) => join(agentRoot, entry))
                .filter((path) => !kept.has(path))
                .map((path) => rm(path, { force: true, recursive: true }))
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
