import { computerGitIdentityPath, type GitIdentity, gitIdentitySchema } from '@haus/api';
import { readServerAttachment } from './server-attachment.ts';

const knownForMs = 60 * 60_000;
const unknownForMs = 5 * 60_000;

const known = new Map<string, { identity: GitIdentity | null; until: number }>();

export async function readGithubBotIdentity(serverRoot: string, now = Date.now()) {
    const held = known.get(serverRoot);
    if (held && held.until > now) {
        return held.identity;
    }
    const identity = await fetchIdentity(serverRoot).catch((cause: unknown) => {
        console.error(
            `Could not read the Haus GitHub App bot for Agent commits: ${cause instanceof Error ? cause.message : cause}`
        );
        return null;
    });
    known.set(serverRoot, { identity, until: now + (identity ? knownForMs : unknownForMs) });
    return identity;
}

async function fetchIdentity(serverRoot: string) {
    const attachment = await readServerAttachment(serverRoot);
    if (attachment === null) {
        return null;
    }
    const response = await fetch(new URL(computerGitIdentityPath, attachment.serverOrigin), {
        headers: { authorization: `Bearer ${attachment.credential}` },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 503) {
        return null;
    }
    if (!response.ok) {
        throw new Error(`the Server answered HTTP ${response.status}`);
    }
    return gitIdentitySchema.parse(await response.json());
}
