export class WorkerCheckoutError extends Error {
    override readonly name = 'WorkerCheckoutError';
}

const gitTimeoutMs = 300_000;

export async function runGit(
    args: readonly string[],
    options: { cwd?: string; signal?: AbortSignal; action: string }
) {
    const child = Bun.spawn(['git', ...args], {
        cwd: options.cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
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
    if (code !== 0) {
        throw new WorkerCheckoutError(`Could not ${options.action}: ${lastLine(stderr)}`);
    }
    return stdout.trim();
}

export async function gitSucceeds(args: readonly string[], cwd: string) {
    const child = Bun.spawn(['git', ...args], {
        cwd,
        stderr: 'ignore',
        stdin: 'ignore',
        stdout: 'ignore',
        timeout: 30_000,
    });
    return (await child.exited) === 0;
}

export function repositoryOfRemote(url: string) {
    const match = /([^/:]+)\/([^/]+?)(?:\.git)?\/?$/u.exec(url.trim());
    return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

function lastLine(text: string) {
    const lines = text.trim().split('\n');
    return (lines.at(-1) ?? '').slice(0, 300) || 'git failed';
}
