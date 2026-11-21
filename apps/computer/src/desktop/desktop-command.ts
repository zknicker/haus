import { dirname, join } from 'node:path';
import { desktopCommandClass } from '@haus/api';
import type { StreamedCommand } from '../invocations/stream-process.ts';
import { runtimeSearchPath } from '../runtime-discovery.ts';

export const desktopInstallHint =
    'Install agent-desktop on this Computer to use computer use: npm install -g agent-desktop';

export interface AgentDesktopCommand {
    args: string[];
    cwd?: string;
    invocationId: string;
    logPath: string;
    platform?: NodeJS.Platform;
    searchPath?: string;
    signal: AbortSignal;
}

let tail: Promise<unknown> = Promise.resolve();

export async function runAgentDesktopCommand<Result>(
    command: AgentDesktopCommand,
    run: (process: StreamedCommand) => Promise<Result>
) {
    if ((command.platform ?? process.platform) !== 'darwin') {
        throw new Error('Computer use runs on macOS Devices.');
    }
    if (desktopCommandClass(command.args) === 'refused') {
        throw new Error(
            'Use one agent-desktop command that looks at or acts on apps. Sessions, batches, traces, held keys, and identity flags are not allowed.'
        );
    }
    const executable = Bun.which('agent-desktop', {
        PATH: command.searchPath ?? runtimeSearchPath(),
    });
    if (!executable) {
        throw new Error(desktopInstallHint);
    }
    return await inQueue(async () => {
        command.signal.throwIfAborted();
        return await run({
            args: withScreenshotPath(command.args, command.logPath),
            ...(command.cwd ? { cwd: command.cwd } : {}),
            executable,
            signal: command.signal,
        });
    });
}

export function withScreenshotPath(args: string[], logPath: string) {
    if (args[0] !== 'screenshot' || args.some((arg) => arg.toLowerCase().endsWith('.png'))) {
        return args;
    }
    const name =
        logPath
            .split('/')
            .at(-1)
            ?.replace(/\.log$/u, '.png') ?? 'screenshot.png';
    return [...args, join(dirname(logPath), name)];
}

function inQueue<Result>(command: () => Promise<Result>) {
    const result = tail.then(command, command);
    tail = result;
    return result;
}
