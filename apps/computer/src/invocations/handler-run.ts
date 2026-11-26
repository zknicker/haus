import {
    type InvocationOperation,
    type InvokeCommand,
    type InvokeResult,
    invocationTimeoutsMs,
} from '@haus/api';
import { withAgentUse } from '../repos/agent-use.ts';
import { invocationEnvironment } from './environment.ts';
import {
    type InvocationPayloads,
    type OperationContext,
    type OperationResult,
    type OperationRunners,
    textResult,
} from './operation.ts';
import type { ProcessRegistry } from './processes/process-registry.ts';
import { recordWorktreeUse } from './worktree-use.ts';

export async function executeInvocation(
    command: InvokeCommand,
    input: {
        agentsRoot: string;
        controller: AbortController;
        logPath: string;
        payloads: InvocationPayloads;
        processes: ProcessRegistry;
        runners: OperationRunners;
        start: () => boolean;
    }
) {
    const { operation } = command;
    const maxMs = invocationTimeoutsMs[operation.kind].max;
    const timeoutMs = Math.min(command.timeoutMs, maxMs);
    const timer = setTimeout(() => input.controller.abort('timeout'), timeoutMs);
    let result: OperationResult;
    try {
        const { cwd, env } = await invocationEnvironment(
            input.agentsRoot,
            command,
            operation.kind === 'bash' ? operation.cwd : undefined
        );
        result = await withAgentUse(command.agentId, async () => {
            if (!input.start()) {
                return notStartedResult;
            }
            const ran = await runOperation(input.runners, operation, {
                agentId: command.agentId,
                cwd,
                env,
                invocationId: command.invocationId,
                logPath: input.logPath,
                payloads: input.payloads,
                processes: input.processes,
                runId: command.runId,
                sessionGeneration: command.sessionGeneration,
                signal: input.controller.signal,
                timeoutMs,
            });
            await recordWorktreeUse(input.agentsRoot, operation, { cwd, env }).catch(logUseFailure);
            return ran;
        });
    } catch (error) {
        result = textResult('failed', error instanceof Error ? error.message : String(error));
    } finally {
        clearTimeout(timer);
    }
    const { output } = result;
    return invokeResult(command.invocationId, {
        ...result,
        output:
            command.timeoutMs > maxMs && output.kind === 'text'
                ? {
                      kind: 'text',
                      text: `${output.text}\n\nTimeout clamped to ${maxMs / 1000} seconds.`,
                  }
                : output,
    });
}

const notStartedResult = textResult('cancelled', 'Cancelled before it started.');

export function cancelledBeforeStart(invocationId: string, text?: string) {
    return invokeResult(
        invocationId,
        text === undefined ? notStartedResult : textResult('cancelled', text)
    );
}

function invokeResult(invocationId: string, result: OperationResult) {
    return {
        invocationId,
        ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
        ...(result.logPath === undefined ? {} : { logPath: result.logPath }),
        outcome: result.outcome,
        output: result.output,
        ...(result.refusal === undefined ? {} : { refusal: result.refusal }),
        truncated: result.truncated,
        type: 'invoke-result',
    } satisfies InvokeResult;
}

function runOperation(
    runners: OperationRunners,
    operation: InvocationOperation,
    context: OperationContext
) {
    switch (operation.kind) {
        case 'bash':
            return runners.bash(operation, context);
        case 'edit':
            return runners.edit(operation, context);
        case 'view-image':
            return runners['view-image'](operation, context);
        case 'file-read':
            return runners['file-read'](operation, context);
        case 'file-write':
            return runners['file-write'](operation, context);
        case 'browser':
            return runners.browser(operation, context);
        case 'desktop':
            return runners.desktop(operation, context);
        case 'repo-checkout':
            return runners['repo-checkout'](operation, context);
        case 'process-read':
            return runners['process-read'](operation, context);
        case 'process-kill':
            return runners['process-kill'](operation, context);
    }
}

function logUseFailure(cause: unknown) {
    console.error(
        `Could not record an Agent worktree use: ${cause instanceof Error ? cause.message : cause}`
    );
}
