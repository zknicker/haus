import type { ChildProcess } from 'node:child_process';

const exitStdioGraceMs = 100;

export function killProcessTree(pid: number) {
    if (process.platform === 'darwin') {
        signalProcess(-pid, 'SIGSTOP');
    }
    if (!signalProcess(-pid, 'SIGKILL')) {
        signalProcess(pid, 'SIGKILL');
    }
}

export function signalProcess(pid: number, signal: NodeJS.Signals) {
    try {
        process.kill(pid, signal);
        return true;
    } catch {
        return false;
    }
}

export function waitForChildProcess(child: ChildProcess) {
    return new Promise<number | null>((resolve, reject) => {
        let settled = false;
        let exited = false;
        let exitCode: number | null = null;
        let postExitTimer: NodeJS.Timeout | undefined;
        let stdoutEnded = child.stdout === null;
        let stderrEnded = child.stderr === null;

        const cleanup = () => {
            if (postExitTimer) {
                clearTimeout(postExitTimer);
                postExitTimer = undefined;
            }
            child.removeListener('error', onError);
            child.removeListener('exit', onExit);
            child.removeListener('close', onClose);
            child.stdout?.removeListener('end', onStdoutEnd);
            child.stderr?.removeListener('end', onStderrEnd);
        };

        const finalize = (code: number | null) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            child.stdout?.destroy();
            child.stderr?.destroy();
            resolve(code);
        };

        const maybeFinalizeAfterExit = () => {
            if (!exited || settled) {
                return;
            }
            if (stdoutEnded && stderrEnded) {
                finalize(exitCode);
            }
        };

        const onStdoutEnd = () => {
            stdoutEnded = true;
            maybeFinalizeAfterExit();
        };

        const onStderrEnd = () => {
            stderrEnded = true;
            maybeFinalizeAfterExit();
        };

        const onError = (error: Error) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            reject(error);
        };

        const onExit = (code: number | null) => {
            exited = true;
            exitCode = code;
            maybeFinalizeAfterExit();
            if (!settled) {
                postExitTimer = setTimeout(() => finalize(exitCode), exitStdioGraceMs);
            }
        };

        const onClose = (code: number | null) => {
            finalize(code);
        };

        child.stdout?.once('end', onStdoutEnd);
        child.stderr?.once('end', onStderrEnd);
        child.once('error', onError);
        child.once('exit', onExit);
        child.once('close', onClose);
    });
}
