import { patchCommandSchema } from '@haus/api';
import type { RunDispatches } from '../dispatch/dispatch-id.ts';
import { createRunDispatches } from '../dispatch/dispatch-id.ts';
import type { DispatchLedger } from '../dispatch/ledger.ts';
import { runHausCommand } from '../haus/haus-cli.ts';
import { routeBashCommand } from '../haus/haus-command.ts';
import { startHausProxy } from '../haus/haus-proxy.ts';
import { createInvocationClient, invocationToolOutcome } from '../invocations/invocation-client.ts';
import type { RunAuthority, RunnerLink, RunTools, ToolOutcome } from '../run-context.ts';
import { editorCommandOf, refusedInput } from './editor-command.ts';
import { runExecute } from './execute-tool.ts';
import { createMcpClient } from './mcp-client.ts';
import { shellCommandOf } from './shell-command.ts';

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
        dispatches,
        graceMs: input.invocationGraceMs,
        link: input.link,
    });
    const proxy = startHausProxy({ authority, dispatches });
    const mcp = createMcpClient(authority);
    const runCommand = async (
        toolCallId: string,
        command: { cwd?: string; machine: string; script: string; timeoutMs?: number },
        signal: AbortSignal
    ) => {
        const route = await routeBashCommand(command.script);
        if (route.kind === 'haus') {
            return await runHausCommand({
                argv: route.argv,
                authority,
                invocations,
                proxy,
                signal,
                stdin: route.stdin,
                timeoutMs: Math.min(command.timeoutMs ?? hausDefaultTimeoutMs, hausMaxTimeoutMs),
                toolCallId,
            });
        }
        if (route.kind === 'haus-not-alone') {
            return hausNotAlone;
        }
        return invocationToolOutcome(
            await invocations.invoke(
                toolCallId,
                { command: command.machine, cwd: command.cwd, kind: 'bash' },
                { requestedTimeoutMs: command.timeoutMs, signal }
            )
        );
    };
    const tools: RunTools = {
        async applyPatch(toolCallId, patch, signal) {
            const parsed = patchCommandSchema.safeParse({
                command: 'apply_patch',
                input: patch.input,
            });
            if (!parsed.success) {
                return refusedInput('apply_patch', parsed.error);
            }
            return invocationToolOutcome(
                await invocations.invoke(
                    toolCallId,
                    { edit: parsed.data, kind: 'edit' },
                    { signal }
                )
            );
        },
        bash(toolCallId, bash, signal) {
            return runCommand(
                toolCallId,
                { machine: bash.command, script: bash.command, timeoutMs: bash.timeout },
                signal
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
        shell(toolCallId, shell, signal) {
            const { command, script } = shellCommandOf(shell.command);
            return runCommand(
                toolCallId,
                { cwd: shell.workdir, machine: command, script, timeoutMs: shell.timeout_ms },
                signal
            );
        },
        async viewImage(toolCallId, view, signal) {
            return invocationToolOutcome(
                await invocations.invoke(
                    toolCallId,
                    { kind: 'view-image', path: view.path },
                    { signal }
                )
            );
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
