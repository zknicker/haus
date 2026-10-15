import { spawnSync } from 'node:child_process';

/** Process-group signalling and inspection for the dev stack's detached children. */
export const shutdownTimeoutMs = Number.parseInt(
    process.env.HAUS_DEV_SHUTDOWN_TIMEOUT_MS ?? '30000',
    10
);
const processGroupShutdownPollMs = 50;

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

export function readProcessCommand(pid) {
    const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
        encoding: 'utf8',
    });

    return typeof result.stdout === 'string' ? result.stdout.trim() : '';
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
