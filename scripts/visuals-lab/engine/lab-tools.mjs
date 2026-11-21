import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { bashRunner } from '../../../apps/computer/src/invocations/bash.ts';
import { editRunner } from '../../../apps/computer/src/invocations/editor.ts';
import { viewImageRunner } from '../../../apps/computer/src/invocations/files.ts';
import { executeInvocation } from '../../../apps/computer/src/invocations/handler-run.ts';
import { inlinePayloads } from '../../../apps/computer/src/invocations/operation.ts';
import { invocationToolOutcome } from '../../../apps/runner/src/invocations/invocation-client.ts';
import { editorCommandOf, refusedInput } from '../../../apps/runner/src/tools/editor-command.ts';
import { editOutcome } from '../../../apps/runner/src/tools/pdf-view.ts';
import { shellCommandOf } from '../../../apps/runner/src/tools/shell-command.ts';
import { invocationTimeoutsMs, patchCommandSchema } from '../../../packages/haus-api/src/index.ts';

const runners = { bash: bashRunner, edit: editRunner, 'view-image': viewImageRunner };

export function createLabTools({ agentId, agentsRoot, runId }) {
    const invoke = async (operation, { requestedTimeoutMs, signal }) => {
        const limits = invocationTimeoutsMs[operation.kind];
        const timeoutMs = Math.min(requestedTimeoutMs ?? limits.default, limits.max);
        const controller = new AbortController();
        const cancel = () => controller.abort('cancel');
        signal.addEventListener('abort', cancel, { once: true });
        try {
            const invocationId = crypto.randomUUID();
            const logsDir = path.join(agentsRoot, agentId, 'logs');
            await mkdir(logsDir, { recursive: true });
            const result = await executeInvocation(
                { agentId, invocationId, operation, runId, timeoutMs, type: 'invoke' },
                {
                    agentsRoot,
                    controller,
                    logPath: path.join(logsDir, `${invocationId}.log`),
                    payloads: inlinePayloads,
                    runners,
                }
            );
            return { frame: result, timeoutMs, timeoutNote: null };
        } finally {
            signal.removeEventListener('abort', cancel);
        }
    };
    const bash = async (command, cwd, requestedTimeoutMs, signal) =>
        invocationToolOutcome(
            await invoke({ command, cwd, kind: 'bash' }, { requestedTimeoutMs, signal })
        );

    return {
        async applyPatch(_toolCallId, patch, signal) {
            const parsed = patchCommandSchema.safeParse({
                command: 'apply_patch',
                input: patch.input,
            });
            if (!parsed.success) {
                return refusedInput('apply_patch', parsed.error);
            }
            return invocationToolOutcome(
                await invoke({ edit: parsed.data, kind: 'edit' }, { signal })
            );
        },
        bash: (_toolCallId, input, signal) => bash(input.command, undefined, input.timeout, signal),
        async edit(_toolCallId, input, signal) {
            const command = editorCommandOf(input);
            if (command.kind === 'refused') {
                return command.outcome;
            }
            const answer = await invoke({ edit: command.command, kind: 'edit' }, { signal });
            return await editOutcome(answer, command.command, signal);
        },
        execute: () => Promise.resolve(refused('execute')),
        settle: () =>
            Promise.resolve({
                sendCount: 0,
                sends: [],
                servedAutomationIds: [],
                visibleMessages: [],
            }),
        shell: (_toolCallId, input, signal) =>
            bash(shellCommandOf(input.command).command, input.workdir, input.timeout_ms, signal),
        async viewImage(_toolCallId, input, signal) {
            return invocationToolOutcome(
                await invoke({ kind: 'view-image', path: input.path }, { signal })
            );
        },
    };
}

function refused(tool) {
    return {
        content: [
            {
                text: `The visuals lab has no Haus Server, so ${tool} is not available.`,
                type: 'text',
            },
        ],
        isError: true,
    };
}
