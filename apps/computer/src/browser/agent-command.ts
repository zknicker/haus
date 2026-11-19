import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { runtimeSearchPath } from '../runtime-discovery.ts';
import { SystemCdpProber } from './cdp-probe.ts';
import { getBrowserService } from './service.ts';

const execFileAsync = promisify(execFile);
const commands = new Set([
    'open',
    'snapshot',
    'click',
    'dblclick',
    'fill',
    'type',
    'press',
    'hover',
    'select',
    'check',
    'uncheck',
    'scroll',
    'scrollintoview',
    'wait',
    'get',
    'is',
    'find',
    'screenshot',
    'pdf',
    'eval',
    'back',
    'forward',
    'reload',
    'tab',
]);
const connectionFlags =
    /^--(?:cdp|profile|session|session-name|namespace|executable-path|auto-connect|provider|config|engine|extension|extensions|headed|proxy|args|state|restore|restore-save)(?:=|$)/u;

export interface AgentBrowserCommand {
    agentId: string;
    args: string[];
    browserRoot: string;
    cwd?: string;
    signal: AbortSignal;
}

export function validateBrowserCommand(args: string[]) {
    if (
        !commands.has(args[0] ?? '') ||
        args.some(
            (arg) =>
                connectionFlags.test(arg) ||
                arg === '--all' ||
                arg === '-p' ||
                arg.startsWith('-p=')
        )
    ) {
        throw new Error(
            'Use a browser page command. Connection overrides and browser-wide lifecycle commands are not allowed.'
        );
    }
}

export async function runAgentBrowserCommand(command: AgentBrowserCommand) {
    validateBrowserCommand(command.args);
    const service = getBrowserService();
    if (!service || service.root !== command.browserRoot) {
        throw new Error(
            'Browser is disabled or unavailable. Configure it in this Computer’s settings.'
        );
    }
    return await service.commandQueue.run(async () => {
        command.signal.throwIfAborted();
        if (
            getBrowserService() !== service ||
            (await service.observer.status()).state !== 'healthy'
        ) {
            throw new Error(
                'The selected browser is unavailable. Refresh its Computer settings and try again.'
            );
        }
        const executable = Bun.which('agent-browser', { PATH: runtimeSearchPath() });
        if (!executable) {
            throw new Error('Install agent-browser on this Computer to use Browser commands.');
        }
        const { webSocketDebuggerUrl } = await new SystemCdpProber().attachment(
            service.contract.userDataDir
        );
        const session = createHash('sha256')
            .update(`${command.browserRoot}:${command.agentId}`)
            .digest('hex')
            .slice(0, 20);
        try {
            const result = await execFileAsync(
                executable,
                ['--session', `haus-${session}`, '--cdp', webSocketDebuggerUrl, ...command.args],
                {
                    ...(command.cwd ? { cwd: command.cwd } : {}),
                    maxBuffer: 1024 * 1024,
                    signal: command.signal,
                }
            );
            return { exitCode: 0, stderr: result.stderr, stdout: result.stdout };
        } catch (error) {
            if (isExit(error)) {
                return { exitCode: error.code, stderr: error.stderr, stdout: error.stdout };
            }
            throw error;
        }
    });
}

function isExit(error: unknown): error is { code: number; stderr: string; stdout: string } {
    return (
        error instanceof Error &&
        'code' in error &&
        typeof error.code === 'number' &&
        'stdout' in error &&
        typeof error.stdout === 'string' &&
        'stderr' in error &&
        typeof error.stderr === 'string'
    );
}
