import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { ToolSet } from '@ai-sdk/provider-utils';
import * as z from 'zod';
import { runtimeSearchPath } from '../runtime-discovery.ts';
import { SystemCdpProber } from './cdp-probe.ts';
import { getBrowserService } from './service.ts';

const execFileAsync = promisify(execFile);
const commandSchema = z.object({ args: z.array(z.string().max(32_768)).min(1).max(100) }).strict();
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

export function validateBrowserCommand(args: string[]): void {
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

/** Resolve the selected browser on every call, including after external recovery. */
export function createBrowserTools(input: { agentId: string; root: string }): ToolSet {
    return {
        browser: {
            description:
                'Use the Chrome browser selected in this Computer’s Browser settings. Pass agent-browser command arguments, for example ["tab","new","https://example.com"], ["snapshot","-i"], ["click","@e1"]. Agents share signed-in accounts and tabs. Create your own tab and operate only on your own tabs; leave service and other agents’ tabs alone. Browser startup, shutdown and connection settings belong to the operator. If unavailable, ask the operator to configure Browser on the Computer.',
            inputSchema: commandSchema,
            execute: async (value, options) => {
                const { args } = commandSchema.parse(value);
                validateBrowserCommand(args);
                const service = getBrowserService();
                if (!service || service.root !== input.root) {
                    throw new Error(
                        'Browser is disabled or unavailable. Configure it in this Computer’s settings.'
                    );
                }
                return await service.commandQueue.run(async () => {
                    options.abortSignal?.throwIfAborted();
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
                        throw new Error(
                            'Install agent-browser on this Computer to use Browser commands.'
                        );
                    }
                    const { webSocketDebuggerUrl } = await new SystemCdpProber().attachment(
                        service.contract.userDataDir
                    );
                    const session = createHash('sha256')
                        .update(`${input.root}:${input.agentId}`)
                        .digest('hex')
                        .slice(0, 20);
                    const result = await execFileAsync(
                        executable,
                        ['--session', `haus-${session}`, '--cdp', webSocketDebuggerUrl, ...args],
                        {
                            maxBuffer: 1024 * 1024,
                            signal: options.abortSignal,
                            timeout: 60_000,
                        }
                    );
                    return result.stdout;
                });
            },
        },
    };
}
