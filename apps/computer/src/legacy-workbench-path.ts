import path from 'node:path';
import { readAgentDrive } from './drive/agent-drive.ts';
import { normalizeWorkspacePath } from './workspace-file-paths.ts';
import { exists } from './workspace-volumes/workspace-volume.ts';

export async function legacyWorkbenchPath(
    agentRoot: string,
    workspaceRoot: string,
    requestedPath: string
) {
    const relativePath = normalizeWorkspacePath(requestedPath, false);
    if (
        relativePath.split('/')[0] !== 'workbench' ||
        (await exists(path.join(workspaceRoot, relativePath)))
    ) {
        return requestedPath;
    }
    const drive = await readAgentDrive(agentRoot);
    return drive ? `drive/agents/${drive.handle}/${relativePath}` : requestedPath;
}
