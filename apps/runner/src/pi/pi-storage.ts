import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { RuntimeResumeRejectedError } from '../turn/resume-rejected.ts';

export function piSessionFile(agentDir: string, nativeSessionId: string) {
    return join(agentDir, 'pi', nativeSessionId, 'session.sqlite');
}

export async function openPiStorage(
    agentDir: string,
    session: { readonly nativeSessionId: string; readonly resume: boolean }
) {
    if (!sessionIdPattern.test(session.nativeSessionId)) {
        throw new RuntimeResumeRejectedError(
            'pi-durable',
            'invalid-state',
            `The Pi session id ${JSON.stringify(session.nativeSessionId)} is not one the runner made.`
        );
    }
    const file = piSessionFile(agentDir, session.nativeSessionId);
    if (session.resume && !(await exists(file))) {
        throw new RuntimeResumeRejectedError(
            'pi-durable',
            'missing',
            `No Pi session store at ${file}.`
        );
    }
    await mkdir(dirname(file), { mode: 0o700, recursive: true });
    return await openNodeSqliteStorage(file);
}

async function exists(file: string) {
    try {
        await stat(file);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
