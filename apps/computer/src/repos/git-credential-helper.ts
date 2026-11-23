import {
    computerGitCredentialPath,
    computerGitCredentialSchema,
    githubTokenUsername,
    repoNameSchema,
} from '@haus/api';
import * as z from 'zod';
import { githubGitRefusalPrefix } from './github-git.ts';
import { readServerAttachment } from './server-attachment.ts';

const refusalSchema = z.object({ error: z.string().min(1) });

interface HelperIo {
    stdin: string;
    writeErr(text: string): void;
    writeOut(text: string): void;
}

export async function runGitCredentialHelper(args: readonly string[], io: HelperIo) {
    const [serverRoot, subject, operation] = args;
    if (!(serverRoot && subject) || operation !== 'get') {
        return 0;
    }
    const repository = githubRepositoryOf(io.stdin);
    if (repository === null) {
        return 0;
    }
    const attachment = await readServerAttachment(serverRoot);
    if (attachment === null) {
        return refuse(io, 'This Computer is not attached to that Server any more.');
    }
    const response = await fetch(new URL(computerGitCredentialPath, attachment.serverOrigin), {
        body: JSON.stringify(
            subject.startsWith('inv_')
                ? { access: 'write', invocationId: subject, repository }
                : { access: 'read', agentId: subject, repository }
        ),
        headers: {
            authorization: `Bearer ${attachment.credential}`,
            'content-type': 'application/json',
        },
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (response === null) {
        return refuse(io, 'This Computer could not reach the Haus Server for a GitHub token.');
    }
    const body = (await response.json().catch(() => null)) as unknown;
    const credential = computerGitCredentialSchema.safeParse(body);
    if (!(response.ok && credential.success)) {
        const refusal = refusalSchema.safeParse(body);
        return refuse(
            io,
            refusal.success
                ? refusal.data.error
                : `The Haus Server gave no GitHub token for ${repository} (HTTP ${response.status}).`
        );
    }
    io.writeOut(`username=${githubTokenUsername}\npassword=${credential.data.token}\n`);
    return 0;
}

function refuse(io: HelperIo, message: string) {
    io.writeErr(`${githubGitRefusalPrefix}${message}\n`);
    io.writeOut('quit=1\n');
    return 0;
}

function githubRepositoryOf(stdin: string) {
    const fields = new Map(
        stdin
            .split('\n')
            .map((line) => line.split('='))
            .filter((parts) => parts.length >= 2)
            .map(([key = '', ...value]) => [key, value.join('=')] as const)
    );
    if (fields.get('protocol') !== 'https' || fields.get('host')?.toLowerCase() !== 'github.com') {
        return null;
    }
    const path = (fields.get('path') ?? '').replace(/\.git\/?$/u, '').replace(/\/$/u, '');
    const parsed = repoNameSchema.safeParse(path);
    return parsed.success ? parsed.data : null;
}
