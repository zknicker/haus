import * as z from 'zod';
import { defineHostTool, type HostToolSet } from '../host-tools/host-tool.ts';
import { type StreamedCommand, streamProcess } from '../invocations/stream-process.ts';
import { runAgentBrowserCommand } from './agent-command.ts';

const outputByteCap = 1024 * 1024;
const commandSchema = z.object({ args: z.array(z.string().max(32_768)).min(1).max(100) }).strict();

export function createBrowserTools(input: { agentId: string; root: string }): HostToolSet {
    return [
        defineHostTool({
            name: 'browser',
            description:
                'Use the Chrome browser selected in this Computer’s Browser settings. Pass agent-browser command arguments, for example ["tab","new","https://example.com"], ["snapshot","-i"], ["click","@e1"]. Agents share signed-in accounts and tabs. Create your own tab and operate only on your own tabs; leave service and other agents’ tabs alone. Browser startup, shutdown and connection settings belong to the operator. If unavailable, ask the operator to configure Browser on the Computer.',
            inputSchema: commandSchema,
            execute: async ({ args }, options) => {
                const result = await runAgentBrowserCommand(
                    {
                        agentId: input.agentId,
                        args,
                        browserRoot: input.root,
                        signal: AbortSignal.any([options.signal, AbortSignal.timeout(60_000)]),
                    },
                    collectOutput
                );
                if (result.exitCode !== 0) {
                    throw new Error(
                        result.stderr ||
                            result.stdout ||
                            `agent-browser exited with code ${result.exitCode}.`
                    );
                }
                return { type: 'text', text: result.stdout };
            },
        }),
    ];
}

async function collectOutput(command: StreamedCommand) {
    const chunks = { stderr: [] as Buffer[], stdout: [] as Buffer[] };
    const sizes = { stderr: 0, stdout: 0 };
    const exitCode = await streamProcess(command, (data, pipe) => {
        const room = outputByteCap - sizes[pipe];
        if (room > 0) {
            chunks[pipe].push(data.subarray(0, room));
        }
        sizes[pipe] += data.byteLength;
    });
    command.signal.throwIfAborted();
    return {
        exitCode,
        stderr: Buffer.concat(chunks.stderr).toString('utf-8'),
        stdout: Buffer.concat(chunks.stdout).toString('utf-8'),
    };
}
