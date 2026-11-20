import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';

export interface AgentDrive {
    area: string;
    folder: string;
    handle: string;
    memory: string;
    skills: string;
}

const handlePattern = /^[^./\\\0][^/\\\0]*$/u;
const recordSchema = z.object({ handle: z.string().regex(handlePattern) });

export function agentDrive(agentRoot: string, handle: string) {
    if (!handlePattern.test(handle)) {
        throw new Error(`"${handle}" cannot name a Drive area.`);
    }
    const folder = join(agentRoot, 'workspace', 'drive');
    const area = join(folder, 'agents', handle);
    return {
        area,
        folder,
        handle,
        memory: join(area, 'MEMORY.md'),
        skills: join(area, 'skills'),
    } satisfies AgentDrive;
}

export async function recordAgentDriveHandle(agentRoot: string, handle: string) {
    agentDrive(agentRoot, handle);
    if ((await readAgentDrive(agentRoot))?.handle === handle) {
        return;
    }
    const destination = recordPath(agentRoot);
    await mkdir(join(agentRoot, 'runtime'), { mode: 0o700, recursive: true });
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ handle })}\n`, { mode: 0o600 });
    await rename(temporary, destination);
}

export async function readAgentDrive(agentRoot: string) {
    let raw: string;
    try {
        raw = await readFile(recordPath(agentRoot), 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
    const record = recordSchema.parse(JSON.parse(raw));
    return agentDrive(agentRoot, record.handle);
}

function recordPath(agentRoot: string) {
    return join(agentRoot, 'runtime', 'drive-area.json');
}
