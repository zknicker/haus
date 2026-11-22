import { dirname, join } from 'node:path';
import { desktopCommandClass } from '@haus/api';
import { computerUseLockPath, installAgentDesktop } from './agent-desktop-binary.ts';
import { openLockedDesktop } from './desktop-lock.ts';
import { prepareScreen } from './desktop-preflight.ts';
import { runDesktopProcess } from './desktop-process.ts';
import { refusalResult } from './desktop-refusals.ts';

export interface AgentDesktopCommand {
    args: string[];
    cwd?: string;
    logPath: string;
    platform?: NodeJS.Platform;
    signal: AbortSignal;
    toolsRoot: string;
}

export async function runAgentDesktopCommand(command: AgentDesktopCommand) {
    if ((command.platform ?? process.platform) !== 'darwin') {
        throw new Error('Computer use runs on macOS Devices.');
    }
    const commandClass = desktopCommandClass(command.args);
    if (commandClass === 'refused') {
        throw new Error(
            'Use one agent-desktop command that looks at or acts on apps. Sessions, batches, traces, held keys, and identity flags are not allowed.'
        );
    }
    const install = await installAgentDesktop(command.toolsRoot);
    const args = withScreenshotPath(command.args, command.logPath);
    const desktop = await openLockedDesktop(
        computerUseLockPath(command.toolsRoot),
        {
            ...(commandClass === 'act'
                ? { args: ['-d', install.executable, ...args], executable: '/usr/bin/caffeinate' }
                : { args, executable: install.executable }),
            ...(command.cwd ? { cwd: command.cwd } : {}),
            env: { AGENT_DESKTOP_MACOS_HELPER_PATH: install.helper },
        },
        command.signal
    );
    try {
        const refusal = await prepareScreen(command.signal);
        if (refusal) {
            await desktop.abandon();
            return refusalResult(refusal);
        }
        command.signal.throwIfAborted();
    } catch (error) {
        await desktop.abandon();
        throw error;
    }
    return await runDesktopProcess(desktop, command);
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
