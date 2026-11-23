import { repoNameSchema } from '@haus/api';
import {
    type GithubAppGit,
    githubGitArgs,
    githubGitRefusalPrefix,
} from '../../repos/github-git.ts';

export class WorkerCheckoutError extends Error {
    override readonly name = 'WorkerCheckoutError';
}

export type GitCredentials = 'machine' | 'none' | GithubAppGit;

interface GitOptions {
    action: string;
    credentials?: GitCredentials;
    cwd?: string;
    signal?: AbortSignal;
}

const gitTimeoutMs = 300_000;
const lockAttempts = 4;
const lockBackoffMs = 150;
const keylessSsh =
    'ssh -F /dev/null -o IdentityAgent=none -o IdentitiesOnly=yes -o IdentityFile=/dev/null -o BatchMode=yes -o PasswordAuthentication=no';
const lockError = /\.lock'?: File exists|Unable to create '[^']+\.lock'|cannot lock ref/u;

export async function runGit(args: readonly string[], options: GitOptions) {
    for (let attempt = 1; ; attempt += 1) {
        const { code, stderr, stdout } = await spawnGit(args, options);
        if (code === 0) {
            return stdout.trim();
        }
        if (!(lockError.test(stderr) && attempt < lockAttempts) || options.signal?.aborted) {
            throw new WorkerCheckoutError(`Could not ${options.action}: ${failureLine(stderr)}`);
        }
        await Bun.sleep(lockBackoffMs * attempt);
    }
}

export async function gitSucceeds(
    args: readonly string[],
    cwd: string,
    credentials: GitCredentials = 'machine'
) {
    return (await gitOutput(args, cwd, credentials)) !== null;
}

export async function gitOutput(
    args: readonly string[],
    cwd: string,
    credentials: GitCredentials = 'machine'
) {
    try {
        return await runGit(args, { action: `run git ${args[0]}`, credentials, cwd });
    } catch (cause) {
        if (cause instanceof WorkerCheckoutError) {
            return null;
        }
        throw cause;
    }
}

export function readOrigin(path: string) {
    return gitOutput(['config', '--get', 'remote.origin.url'], path);
}

export function githubRepositoryOfRemote(url: string) {
    for (const pattern of githubRemotes) {
        const match = pattern.exec(url.trim());
        if (match) {
            const parsed = repoNameSchema.safeParse(`${match[1]}/${match[2]}`);
            return parsed.success ? parsed.data : null;
        }
    }
    return null;
}

const githubRemotes = [
    /^https:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/iu,
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/iu,
    /^ssh:\/\/git@github\.com(?::22)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/iu,
];

async function spawnGit(args: readonly string[], options: GitOptions) {
    const credentials = options.credentials ?? 'machine';
    const agent = credentials !== 'machine';
    const {
        GIT_ASKPASS: askpass,
        GIT_SSH: gitSsh,
        GIT_SSH_COMMAND: sshCommand,
        SSH_ASKPASS: sshAskpass,
        SSH_AUTH_SOCK: sshAuthSock,
        ...rest
    } = process.env;
    const machine = {
        GIT_ASKPASS: askpass,
        GIT_SSH: gitSsh,
        GIT_SSH_COMMAND: sshCommand,
        SSH_ASKPASS: sshAskpass,
        SSH_AUTH_SOCK: sshAuthSock,
    };
    const env = {
        ...rest,
        ...(agent ? { GIT_SSH_COMMAND: keylessSsh } : machine),
        GIT_TERMINAL_PROMPT: '0',
    };
    const config =
        credentials === 'machine' ? [] : githubGitArgs(credentials === 'none' ? null : credentials);
    const child = Bun.spawn(['git', ...config, ...args], {
        cwd: options.cwd,
        env,
        killSignal: 'SIGKILL',
        signal: options.signal,
        stderr: 'pipe',
        stdin: 'ignore',
        stdout: 'pipe',
        timeout: gitTimeoutMs,
    });
    const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    return { code, stderr, stdout };
}

function failureLine(text: string) {
    const lines = text.trim().split('\n');
    const refusal = lines.find((line) => line.startsWith(githubGitRefusalPrefix));
    const line = refusal?.slice(githubGitRefusalPrefix.length) ?? lines.at(-1) ?? '';
    return line.slice(0, 300) || 'git failed';
}
