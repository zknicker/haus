import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
    type AttachmentCredentialProblem,
    AttachmentCredentialUnavailableError,
} from './attachment-keychain.ts';
import { writePrivateJson } from './attachment-store.ts';

const recheckMs = 30_000;

export async function readAttachmentWhenAvailable<T>(
    read: () => Promise<T>,
    input: { dataRoot: string; log(message: string): void; serverId: string | undefined }
) {
    let reported: AttachmentCredentialProblem | null = null;
    for (;;) {
        try {
            const attachment = await read();
            if (input.serverId) {
                await rm(waitPath(input.dataRoot, input.serverId), { force: true });
            }
            return attachment;
        } catch (cause) {
            if (!(cause instanceof AttachmentCredentialUnavailableError && input.serverId)) {
                throw cause;
            }
            if (reported !== cause.problem) {
                input.log(cause.message);
                await writePrivateJson(waitPath(input.dataRoot, input.serverId), {
                    problem: cause.problem,
                });
                reported = cause.problem;
            }
            await Bun.sleep(recheckMs);
        }
    }
}

export async function readAttachmentCredentialWait(dataRoot: string, serverId: string) {
    try {
        const { problem } = JSON.parse(await readFile(waitPath(dataRoot, serverId), 'utf8')) as {
            problem?: unknown;
        };
        const known: AttachmentCredentialProblem | null =
            problem === 'locked' || problem === 'missing' ? problem : null;
        return known;
    } catch {
        return null;
    }
}

function waitPath(dataRoot: string, serverId: string) {
    return join(dataRoot, 'servers', serverId, 'credential-wait.json');
}
