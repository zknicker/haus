import {
    type InvocationOperation,
    type InvokeCommand,
    type InvokeResult,
    invocationTimeoutsMs,
} from '@haus/api';
import { invocationEnvironment } from './environment.ts';
import {
    type InvocationPayloads,
    type OperationContext,
    type OperationResult,
    type OperationRunners,
    textResult,
} from './operation.ts';

export async function executeInvocation(
    command: InvokeCommand,
    input: {
        agentsRoot: string;
        controller: AbortController;
        logPath: string;
        payloads: InvocationPayloads;
        runners: OperationRunners;
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
            command.agentId,
            operation.kind === 'bash' ? operation.cwd : undefined
        );
        result = await runOperation(input.runners, operation, {
            agentId: command.agentId,
            cwd,
            env,
            invocationId: command.invocationId,
            logPath: input.logPath,
            payloads: input.payloads,
            signal: input.controller.signal,
            timeoutMs,
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

export function cancelledBeforeStart(invocationId: string) {
    return invokeResult(invocationId, textResult('cancelled', 'Cancelled before it started.'));
}

function invokeResult(invocationId: string, result: OperationResult) {
    return {
        invocationId,
        ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
        ...(result.logPath === undefined ? {} : { logPath: result.logPath }),
        outcome: result.outcome,
        output: result.output,
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
    }
}
