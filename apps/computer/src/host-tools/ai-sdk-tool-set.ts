import type { ToolSet } from '@ai-sdk/provider-utils';
import { type HostToolSet, hostToolsByName } from './host-tool.ts';

/**
 * Temporary bridge for the AI SDK harness path. Delete with the harness; it is the only
 * host-tools module allowed to import `@ai-sdk/provider-utils`.
 */
export function toAiSdkToolSet(tools: HostToolSet): ToolSet {
    const set: ToolSet = {};
    for (const [name, tool] of hostToolsByName(tools)) {
        set[name] = {
            description: tool.description,
            execute: async (input, options) => {
                const output = await tool.execute(input, {
                    signal: options.abortSignal ?? AbortSignal.any([]),
                    toolCallId: options.toolCallId,
                });
                return output.type === 'text' ? output.text : output.value;
            },
            inputSchema: tool.inputSchema,
        };
    }
    return set;
}
