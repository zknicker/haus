import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { runnerToolDescriptions } from '@haus/agent-prompt';
import type { InvocationOutcome } from '@haus/api';
import * as z from 'zod';
import type { RunTools, ToolOutcome } from '../run-context.ts';
import { computerTargetBounds, computerTargetDescription } from '../tools/computer-target.ts';
import { hausServerName } from './claude-tool-events.ts';

export const hausToolNames = [
    'bash',
    'str_replace_based_edit_tool',
    'execute',
    'process_read',
    'process_kill',
] as const;

export const hausAllowedTools = [
    ...hausToolNames.map((name) => `mcp__${hausServerName}__${name}`),
    'WebSearch',
    'WebFetch',
];

export class HausToolBinding {
    readonly invocations = new Map<string, InvocationOutcome>();
    tools: RunTools | null = null;

    bind(tools: RunTools) {
        this.tools = tools;
        this.invocations.clear();
    }

    async run(
        extra: unknown,
        call: (tools: RunTools, toolCallId: string, signal: AbortSignal) => Promise<ToolOutcome>
    ) {
        const toolCallId = toolUseIdOf(extra);
        const tools = this.tools;
        if (!(tools && toolCallId)) {
            return toolResult({
                content: [{ text: 'No Haus run is active for this tool call.', type: 'text' }],
                isError: true,
            });
        }
        const outcome = await call(tools, toolCallId, signalOf(extra));
        if (outcome.invocation) {
            this.invocations.set(toolCallId, outcome.invocation);
        }
        return toolResult(outcome);
    }
}

export function createHausMcpServer(binding: HausToolBinding) {
    return createSdkMcpServer({
        alwaysLoad: true,
        name: hausServerName,
        tools: [
            tool(
                'bash',
                runnerToolDescriptions.bash,
                {
                    background: z.boolean().optional(),
                    command: z.string().min(1),
                    computer: computerField,
                    description: z.string().optional(),
                    timeout: z.number().int().positive().max(600_000).optional(),
                },
                (input, extra) =>
                    binding.run(extra, (tools, id, signal) => tools.bash(id, input, signal))
            ),
            tool(
                'str_replace_based_edit_tool',
                runnerToolDescriptions.str_replace_based_edit_tool,
                {
                    command: z.enum(['view', 'create', 'str_replace', 'insert']),
                    computer: computerField,
                    file_text: z.string().optional(),
                    insert_line: z.number().int().nonnegative().optional(),
                    new_str: z.string().optional(),
                    old_str: z.string().optional(),
                    path: z.string().min(1),
                    view_range: z.tuple([z.number().int(), z.number().int()]).optional(),
                },
                (input, extra) =>
                    binding.run(extra, (tools, id, signal) => tools.edit(id, input, signal))
            ),
            tool(
                'execute',
                runnerToolDescriptions.execute,
                { code: z.string().min(1) },
                (input, extra) =>
                    binding.run(extra, (tools, id, signal) => tools.execute(id, input, signal))
            ),
            tool(
                'process_read',
                runnerToolDescriptions.process_read,
                {
                    afterSeq: z.number().int().nonnegative(),
                    computer: computerField,
                    processId: z.string().min(1),
                },
                (input, extra) =>
                    binding.run(extra, (tools, id, signal) => tools.processRead(id, input, signal))
            ),
            tool(
                'process_kill',
                runnerToolDescriptions.process_kill,
                { computer: computerField, processId: z.string().min(1) },
                (input, extra) =>
                    binding.run(extra, (tools, id, signal) => tools.processKill(id, input, signal))
            ),
        ],
    });
}

function toolResult(outcome: Pick<ToolOutcome, 'content' | 'isError'>) {
    return {
        content: outcome.content.map((part) =>
            part.type === 'text'
                ? { text: part.text, type: 'text' as const }
                : { data: part.data, mimeType: part.mimeType, type: 'image' as const }
        ),
        ...(outcome.isError ? { isError: true } : {}),
    };
}

const computerField = z
    .string()
    .trim()
    .min(computerTargetBounds.minLength)
    .max(computerTargetBounds.maxLength)
    .optional()
    .describe(computerTargetDescription);

const extraSchema = z.looseObject({
    _meta: z.looseObject({ 'claudecode/toolUseId': z.string().min(1).optional() }).optional(),
});

function toolUseIdOf(extra: unknown) {
    return extraSchema.safeParse(extra).data?._meta?.['claudecode/toolUseId'];
}

function signalOf(extra: unknown) {
    const signal =
        typeof extra === 'object' && extra !== null && 'signal' in extra ? extra.signal : null;
    return signal instanceof AbortSignal ? signal : new AbortController().signal;
}
