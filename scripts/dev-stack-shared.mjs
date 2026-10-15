import { spawnSync } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { resolveDevPorts } from './dev-ports.mjs';
import { readProcessCommand } from './dev-stack-processes.mjs';
import { postgresServerPath } from './postgres-server-account.mjs';

export const startupEventPrefix = 'HAUS_STARTUP_EVENT ';
const ansiPattern = /\u001B\[[0-9;?]*[ -/]*[@-~]/gu;

export function isDesktopMode(mode) {
    return mode === 'desktop';
}

export function createDevStackEnvironment({
    baseEnvironment = process.env,
    ports,
    repositoryRoot = process.cwd(),
} = {}) {
    const resolvedPorts = {
        ...resolveDevPorts({ baseEnvironment, repositoryRoot }),
        ...(ports ?? {}),
    };
    const statePaths = createDevStackStatePaths({ baseEnvironment, repositoryRoot });

    return {
        ...baseEnvironment,
        HAUS_ATTACHMENT_ROOT: baseEnvironment.HAUS_ATTACHMENT_ROOT ?? statePaths.attachmentRoot,
        HAUS_COMPUTER_DATA_ROOT:
            baseEnvironment.HAUS_COMPUTER_DATA_ROOT ?? statePaths.computerDataRoot,
        HAUS_OBJECT_STORAGE_ROOT:
            baseEnvironment.HAUS_OBJECT_STORAGE_ROOT ?? statePaths.objectStorageRoot,
        HAUS_POSTGRES_DATA_ROOT:
            baseEnvironment.HAUS_POSTGRES_DATA_ROOT ?? statePaths.postgresDataRoot,
        HAUS_POSTGRES_SOCKET_ROOT:
            baseEnvironment.HAUS_POSTGRES_SOCKET_ROOT ?? statePaths.postgresSocketRoot,
        HAUS_SERVER_PORT: baseEnvironment.HAUS_SERVER_PORT ?? resolvedPorts.hausPort,
        HAUS_SERVER_ORIGIN:
            baseEnvironment.HAUS_SERVER_ORIGIN ?? `http://127.0.0.1:${resolvedPorts.hausPort}`,
        HAUS_DEV_STACK: baseEnvironment.HAUS_DEV_STACK ?? '1',
        HAUS_WEBSITE_PORT: baseEnvironment.HAUS_WEBSITE_PORT ?? resolvedPorts.websitePort,
    };
}

export function createDevStackConfig({
    baseEnvironment = process.env,
    mode,
    ports,
    repositoryRoot,
}) {
    const isDesktop = isDesktopMode(mode);
    const devEnvironment = createDevStackEnvironment({ baseEnvironment, ports, repositoryRoot });
    return {
        appOrigin: devEnvironment.HAUS_APP_ORIGIN ?? `http://localhost:${ports.websitePort}`,
        desktopEnabled: isDesktop,
        hausServerUrl: `http://localhost:${ports.hausPort}`,
        objectStoragePath: shortenHomePath(devEnvironment.HAUS_OBJECT_STORAGE_ROOT),
        postgresDataPath: shortenHomePath(devEnvironment.HAUS_POSTGRES_DATA_ROOT),
        websiteUrl: `http://localhost:${ports.websitePort}`,
        wsUrl: `ws://localhost:${ports.hausPort}/trpc`,
    };
}

export function shortenHomePath(value) {
    const homeDirectory = process.env.HOME ?? os.homedir();
    const compactPath =
        homeDirectory && value.startsWith(homeDirectory)
            ? `~${value.slice(homeDirectory.length)}`
            : value;
    const segments = compactPath.split('/').filter((segment) => segment.length > 0);

    if (segments.length <= 4) {
        return compactPath;
    }

    const prefix = compactPath.startsWith('~/') ? '~' : '';
    const trailingSegments = segments.slice(-2).join('/');

    return `${prefix}/…/${trailingSegments}`;
}

export async function waitForPort(port, host = '127.0.0.1', timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const isOpen = await new Promise((resolve) => {
            const socket = net.connect({ host, port });
            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.once('error', () => {
                socket.destroy();
                resolve(false);
            });
        });

        if (isOpen) {
            return;
        }

        await sleep(100);
    }

    throw new Error(`Timed out waiting for ${host}:${port}.`);
}

export function assertDevStackPortsAvailable({ ports, repositoryRoot }) {
    const definitions = [
        {
            enabled: true,
            label: 'Server',
            port: Number(ports.hausPort),
        },
        {
            enabled: true,
            label: 'website',
            port: Number(ports.websitePort),
        },
    ];

    const blockers = definitions
        .filter((definition) => definition.enabled)
        .flatMap((definition) =>
            listListeningProcessIds(definition.port).map((pid) => ({
                ...definition,
                command: readProcessCommand(pid),
                cwd: readProcessWorkingDirectory(pid),
                pid,
            }))
        );

    if (blockers.length === 0) {
        return;
    }

    throw new Error(formatPortBlockers(blockers, repositoryRoot));
}

export function cleanupStaleProcesses({
    ports,
    processTools = defaultProcessTools,
    repositoryRoot,
}) {
    const definitions = [
        {
            commandPattern: 'bun --watch src/haus-server.ts',
            cwd: path.join(repositoryRoot, 'apps', 'server'),
            enabled: true,
            port: Number(ports.hausPort),
        },
        {
            commandPattern: 'vite',
            cwd: path.join(repositoryRoot, 'apps', 'website'),
            enabled: true,
            port: Number(ports.websitePort),
        },
    ];

    const staleProcessIds = [];

    for (const definition of definitions) {
        if (!definition.enabled) {
            continue;
        }

        const matches = processTools.listListeningProcessIds(definition.port).filter((pid) => {
            const cwd = processTools.readProcessWorkingDirectory(pid);
            const command = processTools.readProcessCommand(pid);
            if (definition.matches) {
                return definition.matches(pid);
            }
            return cwd === definition.cwd && command.includes(definition.commandPattern);
        });

        staleProcessIds.push(
            ...matches.flatMap((pid) =>
                definition.getProcessIds ? definition.getProcessIds(pid) : pid
            )
        );
    }

    const uniqueProcessIds = [...new Set(staleProcessIds)];

    for (const pid of uniqueProcessIds) {
        processTools.killProcess(pid, 'SIGTERM');
    }

    processTools.waitForProcessExit(uniqueProcessIds);

    return uniqueProcessIds.length;
}

export function formatPortBlockers(blockers, repositoryRoot) {
    const lines = blockers.map((blocker) => {
        const cwd = blocker.cwd
            ? shortenRepositoryPath(blocker.cwd, repositoryRoot)
            : 'unknown cwd';
        const command = blocker.command || 'unknown command';
        return `${blocker.label} port ${blocker.port} is already in use by PID ${blocker.pid}: ${command} (${cwd})`;
    });

    return `Required dev port unavailable:\n${lines.join('\n')}`;
}

export function isSuppressedStartupLine(source, line) {
    if (source === 'website') {
        return (
            /^\s*VITE v/u.test(line) ||
            /Re-optimizing dependencies because lockfile has changed/u.test(line) ||
            /➜\s+Local:/u.test(line) ||
            /➜\s+Network:/u.test(line)
        );
    }

    if (source === 'desktop') {
        return (
            /^\s*\[\d+ms\]\s+bundle/u.test(line) ||
            /^\s*\[\d+ms\]\s+compile/u.test(line) ||
            /Running BeforeDevCommand/u.test(line)
        );
    }

    return false;
}

export function stripAnsi(value) {
    return value.replace(ansiPattern, '');
}

export function createDevStackStatePaths({ baseEnvironment, repositoryRoot }) {
    const stackId =
        baseEnvironment.HAUS_DEV_STACK_ID ??
        `${path.basename(repositoryRoot)}-${hashString(repositoryRoot).slice(0, 8)}`;
    const appStateRoot = path.join(os.homedir(), '.haus', 'dev', stackId);

    return {
        appStateRoot,
        computerDataRoot: path.join(appStateRoot, 'computer'),
        attachmentRoot: path.join(appStateRoot, 'server', 'attachments'),
        objectStorageRoot: path.join(appStateRoot, 'object-storage'),
        postgresDataRoot: postgresServerPath(path.join(appStateRoot, 'postgres')),
        postgresSocketRoot: postgresServerPath(path.join(appStateRoot, 'postgres-socket')),
    };
}

function shortenRepositoryPath(value, repositoryRoot) {
    if (value === repositoryRoot) {
        return '.';
    }
    if (value.startsWith(`${repositoryRoot}${path.sep}`)) {
        return `.${path.sep}${path.relative(repositoryRoot, value)}`;
    }
    return shortenHomePath(value);
}

function hashString(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(31, hash) + value.charCodeAt(index);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function sleep(durationMs) {
    return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function listListeningProcessIds(port) {
    const result = spawnSync('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], {
        encoding: 'utf8',
    });

    if (typeof result.stdout !== 'string' || result.stdout.trim().length === 0) {
        return [];
    }

    return result.stdout
        .split(/\s+/u)
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => Number(value));
}

function readProcessWorkingDirectory(pid) {
    const result = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
        encoding: 'utf8',
    });

    if (typeof result.stdout !== 'string') {
        return null;
    }

    return (
        result.stdout
            .split('\n')
            .find((line) => line.startsWith('n'))
            ?.slice(1) ?? null
    );
}

function waitForProcessExit(processIds) {
    if (processIds.length === 0) {
        return;
    }

    const deadline = Date.now() + 3000;
    let escalated = false;

    while (Date.now() < deadline) {
        const remaining = processIds.filter((pid) => {
            try {
                process.kill(pid, 0);
                return true;
            } catch {
                return false;
            }
        });

        if (remaining.length === 0) {
            return;
        }

        if (!escalated) {
            for (const pid of remaining) {
                process.kill(pid, 'SIGKILL');
            }
            escalated = true;
        }

        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
}

const defaultProcessTools = {
    killProcess: (pid, signal) => process.kill(pid, signal),
    listListeningProcessIds,
    readProcessCommand,
    readProcessWorkingDirectory,
    waitForProcessExit,
};
