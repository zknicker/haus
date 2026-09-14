import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ComputerRuntimeId } from '@haus/api/computer-runtime';

export interface ResolvedRuntimeExecutable {
    path: string;
    searchPath: string;
    version: string;
}

interface RuntimeSearchPathOptions {
    currentPath?: string;
    homeDirectory?: string;
}

const systemSearchPaths = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
];

/** Stable service PATH: inherited entries first, then common user and system installs. */
export function runtimeSearchPath(options: RuntimeSearchPathOptions = {}) {
    const homeDirectory = options.homeDirectory ?? homedir();
    const entries = [
        ...(options.currentPath ?? process.env.PATH ?? '').split(':'),
        join(homeDirectory, '.local', 'bin'),
        join(homeDirectory, '.grok', 'bin'),
        ...systemSearchPaths,
    ];
    return [...new Set(entries.filter(Boolean))].join(':');
}

/**
 * Resolves and probes the concrete CLI. Detection and launch both call this
 * seam so an executable-looking but unusable candidate is never advertised.
 */
export function resolveRuntimeExecutable(
    command: string,
    options: { searchPath?: string } = {}
): ResolvedRuntimeExecutable | null {
    const searchPath = options.searchPath ?? runtimeSearchPath();
    const path = Bun.which(command, { PATH: searchPath });
    if (!path) {
        return null;
    }
    let probe: ReturnType<typeof Bun.spawnSync>;
    try {
        probe = Bun.spawnSync([path, '--version'], {
            env: { ...process.env, PATH: searchPath },
            stderr: 'pipe',
            stdout: 'pipe',
            timeout: 5000,
        });
    } catch {
        return null;
    }
    if (probe.exitCode !== 0) {
        return null;
    }
    const version = `${probe.stdout?.toString() ?? ''}${probe.stderr?.toString() ?? ''}`.trim();
    if (!version) {
        return null;
    }
    return {
        path,
        searchPath: [dirname(path), searchPath].join(':'),
        version: version.split('\n')[0] ?? version,
    };
}

const runtimeCommands: Record<ComputerRuntimeId, string> = {
    'claude-code': 'claude',
    codex: 'codex',
    'grok-build': 'grok',
    pi: 'pi',
};

export function resolveRuntimeById(runtimeId: string, options: { searchPath?: string } = {}) {
    const command = Object.entries(runtimeCommands).find(([id]) => id === runtimeId)?.[1];
    return command ? resolveRuntimeExecutable(command, options) : null;
}
