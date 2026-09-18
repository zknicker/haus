// The mechanics every direct lane shares: how the child's PATH is built, how
// the host login is referenced (never copied), how the process is run to
// completion, and how a JSONL event stream is read.
//
// This sits below the lanes so the runner can import them and they can import
// it, without the two ends of that import meeting in a cycle.
import { lstat, mkdir, readlink, rm, stat, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

/** The CLI's own directory first, then the host search path the config resolved. */
export const directSearchPath = (executable) =>
    [path.dirname(executable.path), executable.searchPath].join(':');

/**
 * References the host's native provider login from the isolated home, exactly
 * as `referenceAuthProfiles` in apps/computer/src/harness/sandbox.ts does: a
 * symlink, so no credential is ever copied into the temp root. A machine that
 * never logged that runtime in simply has nothing to link.
 */
export const linkHostFile = async ({ source, target }) => {
    if (!(await stat(source).catch(() => null))) {
        return false;
    }
    await mkdir(path.dirname(target), { recursive: true });
    const existing = await lstat(target).catch(() => null);
    if (existing?.isSymbolicLink() && (await readlink(target)) === source) {
        return true;
    }
    if (existing) {
        await rm(target, { force: true, recursive: true });
    }
    await symlink(source, target);
    return true;
};

/**
 * Runs the CLI to completion. Both streams are captured: stderr is the only
 * place a refused flag, an expired login or a rejected model id shows up, and
 * the run script writes it into the turn's trace file.
 */
export const runCli = async ({ args, command, cwd, env, timeoutMs }) => {
    const child = Bun.spawn([command, ...args], {
        cwd,
        env,
        stderr: 'pipe',
        // The prompt is an argument; an inherited stdin would make the CLI wait on it.
        stdin: 'ignore',
        stdout: 'pipe',
    });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    try {
        const [stdout, stderr] = await Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ]);
        return { exitCode: await child.exited, stderr, stdout };
    } finally {
        clearTimeout(timer);
    }
};

/** Reads a JSONL event stream; an unparsable line is dropped, never fatal. */
export const parseJsonLines = (text) =>
    text.split('\n').flatMap((line) => {
        if (!line.trim()) {
            return [];
        }
        try {
            return [JSON.parse(line)];
        } catch {
            return [];
        }
    });

/** One trace entry, in the shape the harness lane's tool-call stream produces. */
export const traceEntry = (name, input) => ({
    at: new Date().toISOString(),
    input: JSON.stringify(input ?? null).slice(0, 400),
    name,
});

/** The physical machine's home, the one place a provider login actually lives. */
export const hostHomeDir = () =>
    path.resolve(process.env.HAUS_COMPUTER_HOST_HOME ?? process.env.HOME ?? homedir());
