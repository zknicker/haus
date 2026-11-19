import type { RunDispatches } from '../dispatch/dispatch-id.ts';
import { createRunDispatches } from '../dispatch/dispatch-id.ts';
import type { DispatchLedger } from '../dispatch/ledger.ts';
import { runHausCommand } from '../haus/haus-cli.ts';
import { routeBashCommand } from '../haus/haus-command.ts';
import { startHausProxy } from '../haus/haus-proxy.ts';
import { createInvocationClient, invocationToolOutcome } from '../invocations/invocation-client.ts';
import type { RunAuthority, RunnerLink, RunTools, ToolOutcome } from '../run-context.ts';
import { editorCommandOf } from './editor-command.ts';
import { runExecute } from './execute-tool.ts';
import { createMcpClient } from './mcp-client.ts';

export type RunToolset = ReturnType<typeof createRunTools>;

const hausDefaultTimeoutMs = 120_000;
const hausMaxTimeoutMs = 600_000;

export function createRunTools(input: {
    authority: RunAuthority;
    invocationGraceMs: number;
    ledger: DispatchLedger;
    link: RunnerLink;
}) {
    const { authority } = input;
    const dispatches: RunDispatches = createRunDispatches({
        agentId: authority.agentId,
        ledger: input.ledger,
        runId: authority.runId,
    });
    const invocations = createInvocationClient({
        agentId: authority.agentId,
        authority,
        dispatches,
        graceMs: input.invocationGraceMs,
        link: input.link,
    });
    const proxy = startHausProxy({ authority, dispatches });
    const mcp = createMcpClient(authority);
    const tools: RunTools = {
        async bash(toolCallId, bash, signal) {
            const route = await routeBashCommand(bash.command);
            if (route.kind === 'haus') {
                return await runHausCommand({
                    argv: route.argv,
                    authority,
                    invocations,
                    proxy,
                    signal,
                    stdin: route.stdin,
                    timeoutMs: Math.min(bash.timeout ?? hausDefaultTimeoutMs, hausMaxTimeoutMs),
                    toolCallId,
                });
            }
            if (route.kind === 'haus-not-alone') {
                return hausNotAlone;
            }
            return invocationToolOutcome(
                await invocations.invoke(
                    toolCallId,
                    { command: bash.command, kind: 'bash' },
                    { requestedTimeoutMs: bash.timeout, signal }
                )
            );
        },
        async edit(toolCallId, edit, signal) {
            const command = editorCommandOf(edit);
            if (command.kind === 'refused') {
                return command.outcome;
            }
            return invocationToolOutcome(
                await invocations.invoke(
                    toolCallId,
                    { edit: command.command, kind: 'edit' },
                    { signal }
                )
            );
        },
        async execute(toolCallId, execute, signal) {
            return await runExecute({
                code: execute.code,
                dispatches,
                invocations,
                mcp,
                signal,
                toolCallId,
            });
        },
        async settle() {
            const visibility = proxy.visibility();
            proxy.close();
            return visibility;
        },
    };
    return {
        cancelOpen: invocations.cancelOpen,
        receive: invocations.receive,
        tools,
    };
}

const hausNotAlone = {
    content: [
        {
            text: [
                'Error: haus must run as its own command, not inside a pipeline, list, substitution, or redirection, and with literal arguments.',
                'Code: HAUS_NOT_ALONE',
                'Next action: run `haus` as its own command.',
            ].join('\n'),
            type: 'text',
        },
    ],
    isError: true,
} satisfies ToolOutcome;
