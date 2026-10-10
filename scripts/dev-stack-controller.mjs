import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import readline from 'node:readline';
import {
    hasHausSchema,
    postgresLocaleEnvironment,
    prepareDevPostgres,
    reserveDevPostgresPort,
    stopStaleDevPostgres,
    waitForDevPostgres,
} from './dev-postgres.mjs';
import { createDevServerEnvironment } from './dev-stack-server-environment.mjs';
import {
    assertDevStackPortsAvailable,
    cleanupStaleProcesses,
    createDevStackConfig,
    createDevStackEnvironment,
    isDesktopMode,
    isSuppressedStartupLine,
    startupEventPrefix,
    stripAnsi,
    waitForPort,
} from './dev-stack-shared.mjs';

const shutdownProcessOrder = ['desktop', 'website', 'computer', 'haus', 'postgres'];
const shutdownTimeoutMs = Number.parseInt(process.env.HAUS_DEV_SHUTDOWN_TIMEOUT_MS ?? '30000', 10);
const processGroupShutdownPollMs = 50;

export class DevStackController extends EventEmitter {
    constructor({ mode, ports, repositoryRoot, spawnImpl = spawn }) {
        super();
        this.mode = mode;
        this.ports = ports;
        this.repositoryRoot = repositoryRoot;
        this.spawnImpl = spawnImpl;
        this.processes = new Map();
        this.backgroundProcesses = new Set();
        this.expectedProcessStops = new Set();
        this.isStopping = false;
        this.isSteadyState = false;
        this.stopPromise = null;
        this.snapshot = this.createInitialSnapshot();
    }

    createInitialSnapshot() {
        const isDesktop = isDesktopMode(this.mode);

        return {
            config: createDevStackConfig({
                mode: this.mode,
                ports: this.ports,
                repositoryRoot: this.repositoryRoot,
            }),
            phase: 'starting',
            logs: [],
            processes: {
                computer: { status: 'waiting' },
                desktop: { status: isDesktop ? 'waiting' : 'disabled' },
                haus: { status: 'waiting' },
                postgres: { status: 'waiting' },
                website: { status: 'waiting' },
            },
            staleCleanupCount: 0,
        };
    }

    getSnapshot() {
        return this.snapshot;
    }

    update(mutator) {
        mutator(this.snapshot);
        this.emit('update', this.snapshot);
        this.maybeEnterSteadyState();
    }

    addLog(source, line) {
        if (!line || isSuppressedStartupLine(source, line)) {
            return;
        }

        const entry = { line, source };
        this.update((snapshot) => {
            snapshot.logs = [...snapshot.logs, entry].slice(-40);
        });
        this.emit('log', entry);
    }

    parseOutputLine(source, line) {
        const normalizedLine = stripAnsi(line);

        if (source === 'desktop' && /Running `.*haus-desktop`/u.test(normalizedLine)) {
            this.addLog(source, normalizedLine);
            this.update((snapshot) => {
                snapshot.processes.desktop.status = 'running';
            });
            return;
        }

        if (normalizedLine.startsWith(startupEventPrefix)) {
            try {
                const event = JSON.parse(normalizedLine.slice(startupEventPrefix.length));
                this.addLog(source, event.payload?.message ?? event.type);
            } catch {
                this.addLog(source, normalizedLine);
            }
            return;
        }

        this.addLog(source, normalizedLine);
    }

    attachProcessOutput(source, child) {
        const attach = (stream) => {
            if (!stream) {
                return;
            }

            const reader = readline.createInterface({ input: stream });
            reader.on('line', (line) => {
                this.parseOutputLine(source, line);
            });
        };

        attach(child.stdout);
        attach(child.stderr);
    }

    spawnProcess(source, executable, args = [], options = {}) {
        this.update((snapshot) => {
            snapshot.processes[source].status = 'starting';
        });

        const child = this.spawnImpl(executable, args, {
            cwd: options.cwd ?? this.repositoryRoot,
            detached: true,
            env: options.env ?? process.env,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        this.processes.set(source, child);
        this.attachProcessOutput(source, child);

        child.on('exit', (code, signal) => {
            if (this.expectedProcessStops.delete(source)) {
                return;
            }
            if (!this.isStopping) {
                this.update((snapshot) => {
                    snapshot.processes[source].status = code === 0 ? 'stopped' : 'error';
                });
                this.addLog(source, `process exited (${signal ?? code ?? 'unknown'})`);
                void this.stop(code ?? 1);
            }
        });

        child.on('error', (error) => {
            this.update((snapshot) => {
                snapshot.processes[source].status = 'error';
            });
            this.addLog(source, error.message);
            void this.stop(1);
        });

        return child;
    }

    spawnBackgroundProcess(source, command, env = process.env) {
        const child = this.spawnImpl(command, {
            cwd: this.repositoryRoot,
            detached: true,
            env,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        this.attachProcessOutput(source, child);
        this.backgroundProcesses.add(child);

        return new Promise((resolve) => {
            child.on('exit', (code, signal) => {
                this.backgroundProcesses.delete(child);
                if (code !== 0 && !this.isStopping) {
                    this.addLog(source, `prebuild exited (${signal ?? code ?? 'unknown'})`);
                }
                resolve(code === 0);
            });

            child.on('error', (error) => {
                this.backgroundProcesses.delete(child);
                if (!this.isStopping) {
                    this.addLog(source, error.message);
                }
                resolve(false);
            });
        });
    }

    cleanupStaleProcesses() {
        const devStackEnvironment = createDevStackEnvironment({
            ports: this.ports,
            repositoryRoot: this.repositoryRoot,
        });
        this.update((snapshot) => {
            snapshot.staleCleanupCount =
                cleanupStaleProcesses({
                    mode: this.mode,
                    ports: this.ports,
                    repositoryRoot: this.repositoryRoot,
                }) + stopStaleDevPostgres(devStackEnvironment);
        });
    }

    async start() {
        this.cleanupStaleProcesses();
        assertDevStackPortsAvailable({
            mode: this.mode,
            ports: this.ports,
            repositoryRoot: this.repositoryRoot,
        });

        const devStackEnvironment = createDevStackEnvironment({
            ports: this.ports,
            repositoryRoot: this.repositoryRoot,
        });
        const computerDirectory = path.join(this.repositoryRoot, 'apps', 'computer');
        const serverDirectory = path.join(this.repositoryRoot, 'apps', 'server');
        const websiteDirectory = path.join(this.repositoryRoot, 'apps', 'website');
        const startupUiEnv = {
            ...devStackEnvironment,
            HAUS_STARTUP_UI: '1',
        };
        const serverUrl = `http://localhost:${this.ports.hausPort}`;
        const websiteEnv = {
            ...startupUiEnv,
            VITE_HAUS_APP_ORIGIN: startupUiEnv.HAUS_APP_ORIGIN,
            VITE_HAUS_SERVER_ORIGIN: serverUrl,
        };
        let websiteReadyPromise = null;
        let desktopPrebuildPromise = null;

        const startWebsite = () => {
            if (!websiteReadyPromise) {
                this.spawnProcess(
                    'website',
                    'bun',
                    ['x', 'vite', '--host', '127.0.0.1', '--port', String(this.ports.websitePort)],
                    {
                        cwd: websiteDirectory,
                        env: websiteEnv,
                    }
                );
                websiteReadyPromise = waitForPort(Number(this.ports.websitePort)).then(() => {
                    this.update((snapshot) => {
                        snapshot.processes.website.status = 'running';
                    });
                });
            }
        };

        const getDesktopEnv = () =>
            createDesktopDevEnvironment({
                devStackEnvironment,
                ports: this.ports,
            });

        const startDesktopPrebuild = () => {
            if (!(isDesktopMode(this.mode) && !desktopPrebuildPromise)) {
                return;
            }

            const desktopEnv = getDesktopEnv();
            const prebuildCommand = 'node scripts/build-macos-app-icon.mjs';
            desktopPrebuildPromise = this.spawnBackgroundProcess(
                'desktop',
                prebuildCommand,
                desktopEnv
            );
        };

        startDesktopPrebuild();
        const postgres = prepareDevPostgres(devStackEnvironment, await reserveDevPostgresPort());
        const postgresChild = this.spawnProcess('postgres', postgres.executable, postgres.args, {
            env: { ...startupUiEnv, ...postgresLocaleEnvironment() },
        });
        await waitForDevPostgres(postgres, postgresChild);
        this.update((snapshot) => {
            snapshot.processes.postgres.status = 'running';
        });

        const serverEnv = createDevServerEnvironment(
            startupUiEnv,
            this.ports,
            postgres.databaseUrl
        );
        if (hasHausSchema(postgres)) {
            const migrated = await this.spawnBackgroundProcess(
                'haus',
                'bun apps/server/src/haus-server-migrate.ts',
                {
                    ...serverEnv,
                    HAUS_DATABASE_MIGRATION_URL: postgres.databaseUrl,
                    HAUS_DATABASE_BACKUP_ROLE: 'haus',
                    HAUS_DATABASE_RUNTIME_ROLE: 'haus',
                }
            );
            if (!migrated) {
                const dataRoot = devStackEnvironment.HAUS_POSTGRES_DATA_ROOT;
                throw new Error(
                    'Failed to migrate the development Server database. ' +
                        `If this dev database predates checked-in migrations, move ${dataRoot} aside and rerun.`
                );
            }
        } else {
            const bootstrapped = await this.spawnBackgroundProcess(
                'haus',
                'bun apps/server/src/haus-server-bootstrap.ts',
                {
                    ...serverEnv,
                    HAUS_DATABASE_BOOTSTRAP_URL: postgres.databaseUrl,
                    HAUS_DATABASE_BACKUP_ROLE: 'haus',
                    HAUS_DATABASE_RUNTIME_ROLE: 'haus',
                }
            );
            if (!bootstrapped) {
                throw new Error('Failed to bootstrap the development Server.');
            }
        }

        this.spawnProcess('haus', 'bun', ['--watch', 'src/haus-server.ts'], {
            cwd: serverDirectory,
            env: serverEnv,
        });
        await waitForPort(Number(this.ports.hausPort));
        this.update((snapshot) => {
            snapshot.processes.haus.status = 'running';
        });

        this.spawnProcess('computer', 'bun', ['--watch', 'src/index.ts', 'start'], {
            cwd: computerDirectory,
            env: {
                ...startupUiEnv,
                HAUS_COMPUTER_RESIDENT: '1',
                HAUS_COMPUTER_WATCH_ATTACHMENT_DAEMON: '1',
                HAUS_SERVER_ORIGIN: serverUrl,
            },
        });
        this.update((snapshot) => {
            snapshot.processes.computer.status = 'running';
        });

        startWebsite();
        await websiteReadyPromise;

        if (isDesktopMode(this.mode)) {
            if (desktopPrebuildPromise) {
                await desktopPrebuildPromise;
            }
            this.spawnProcess('desktop', 'node', ['scripts/run-desktop-dev.mjs'], {
                env: getDesktopEnv(),
            });
            this.update((snapshot) => {
                snapshot.processes.desktop.status = 'running';
            });
        }

        this.maybeEnterSteadyState();
    }

    async stop(exitCode = 0, options = {}) {
        if (this.stopPromise) {
            if (options.force) {
                this.signalManagedProcesses('SIGTERM');
            }
            return this.stopPromise;
        }
        this.isStopping = true;

        this.stopPromise = (async () => {
            const shutdownSignal = options.signal ?? 'SIGTERM';
            this.addLog(
                'haus',
                options.signal ? `shutdown requested (${options.signal})` : 'shutdown requested'
            );
            this.update((snapshot) => {
                snapshot.phase = 'stopping';
            });

            this.signalManagedProcesses(shutdownSignal);

            for (const source of shutdownProcessOrder) {
                await this.stopProcess(source, { signaled: true });
            }

            this.emit('exit', exitCode);
        })();

        return this.stopPromise;
    }

    signalManagedProcesses(signal) {
        for (const [source, child] of this.processes) {
            signalChildProcessGroup(child, source === 'postgres' ? 'SIGINT' : signal);
        }
        this.signalBackgroundProcesses(signal);
    }

    signalBackgroundProcesses(signal) {
        for (const child of this.backgroundProcesses) {
            signalChildProcessGroup(child, signal);
        }
    }

    async stopProcess(source, options = {}) {
        const child = this.processes.get(source);

        if (!child) {
            return;
        }

        this.update((snapshot) => {
            snapshot.processes[source].status = 'stopping';
        });
        this.addLog(source, 'stopping');

        if (options.expected) {
            this.expectedProcessStops.add(source);
        }

        const stopped = await waitForChildShutdown(
            child,
            options.signaled
                ? undefined
                : () => {
                      signalChildProcessGroup(child, 'SIGTERM');
                  }
        );
        this.expectedProcessStops.delete(source);

        if (!stopped) {
            this.addLog(
                source,
                `shutdown timed out after ${Math.round(shutdownTimeoutMs / 1000)}s; killing`
            );
            signalChildProcessGroup(child, 'SIGKILL');
            await waitForChildShutdown(child);
        }

        this.processes.delete(source);
        this.update((snapshot) => {
            snapshot.processes[source].status = 'stopped';
        });
    }

    maybeEnterSteadyState() {
        if (this.isSteadyState || !isStartupComplete(this.snapshot)) {
            return;
        }

        this.isSteadyState = true;
        this.update((snapshot) => {
            snapshot.phase = 'running';
        });
        this.emit('steady');
    }
}

export function createDesktopDevEnvironment({ devStackEnvironment, ports }) {
    return {
        ...devStackEnvironment,
        HAUS_WEBSITE_PORT: String(ports.websitePort),
    };
}

export function signalChildProcessGroup(child, signal, killProcessGroup = process.kill) {
    if (!child.pid) {
        return false;
    }

    try {
        killProcessGroup(-child.pid, signal);
        return true;
    } catch {
        if (child.exitCode !== null || child.signalCode !== null) {
            return false;
        }

        return child.kill(signal);
    }
}

export function waitForChildShutdown(child, beforeWait, options = {}) {
    const isProcessGroupActive =
        options.isProcessGroupActive ??
        (() => {
            return isChildProcessGroupActive(child);
        });
    const pollMs = options.pollMs ?? processGroupShutdownPollMs;
    const timeoutMs = options.timeoutMs ?? shutdownTimeoutMs;
    let childExited = child.exitCode !== null || child.signalCode !== null;

    if (!child.pid) {
        return Promise.resolve(childExited);
    }

    return new Promise((resolve) => {
        let interval = null;
        const timeout = setTimeout(() => {
            child.off('exit', onExit);
            if (interval) {
                clearInterval(interval);
            }
            resolve(false);
        }, timeoutMs);

        const finish = () => {
            clearTimeout(timeout);
            if (interval) {
                clearInterval(interval);
            }
            child.off('exit', onExit);
            resolve(true);
        };

        const checkShutdown = () => {
            if (childExited && !isProcessGroupActive()) {
                finish();
            }
        };

        const onExit = () => {
            childExited = true;
            checkShutdown();
        };

        if (!childExited) {
            child.once('exit', onExit);
        }

        interval = setInterval(checkShutdown, pollMs);
        beforeWait?.();
        checkShutdown();
    });
}

function isChildProcessGroupActive(child) {
    if (!child.pid) {
        return false;
    }

    try {
        process.kill(-child.pid, 0);
        return true;
    } catch {
        return false;
    }
}

function isStartupComplete(snapshot) {
    const desktopReady =
        snapshot.processes.desktop.status === 'disabled' ||
        snapshot.processes.desktop.status === 'running';
    const hausReady = snapshot.processes.haus.status === 'running';
    const computerReady = snapshot.processes.computer.status === 'running';
    const postgresReady = snapshot.processes.postgres.status === 'running';

    return (
        computerReady &&
        hausReady &&
        postgresReady &&
        snapshot.processes.website.status === 'running' &&
        desktopReady
    );
}
