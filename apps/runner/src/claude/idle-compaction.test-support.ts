import type { HarnessContext } from '../turn/context-snapshot.ts';
import { claudeHarnessContext } from './claude-context.ts';
import type { CompactedProcess } from './idle-compaction-reporter.ts';
import type { IdleCompactionOwner } from './idle-compaction.ts';

export const compactedUsage = claudeHarnessContext(
    {
        categories: [
            { color: 'g', id: 'system_prompt', kind: 'used', name: 'System prompt', tokens: 9000 },
            { color: 'p', id: 'system_tools', kind: 'used', name: 'System tools', tokens: 3000 },
            { color: 'p', id: 'mcp_tools', kind: 'used', name: 'MCP tools', tokens: 7000 },
            { color: 'b', id: 'messages', kind: 'used', name: 'Messages', tokens: 6000 },
            {
                color: 'r',
                id: 'autocompact_buffer',
                kind: 'buffer',
                name: 'Autocompact buffer',
                tokens: 33_000,
            },
            { color: 'w', id: 'free_space', kind: 'free', name: 'Free space', tokens: 942_000 },
        ],
        rawMaxTokens: 1_000_000,
    },
    1_000_000
);

export function compactionOwner(agentDir: string, agentId: string, sessionGeneration = 3) {
    const owner: IdleCompactionOwner = {
        agentDir,
        agentId,
        context: {
            instructions: 'You are Blippy, a Haus Agent.\n',
            skillListing: 'x'.repeat(4000),
            start: { agentId, modelId: 'claude-opus-4-7', runId: 'run_last', sessionGeneration },
        },
        runtimeId: 'claude-agent-sdk',
    };
    return owner;
}

export function compactedProcess(
    owner: IdleCompactionOwner | null,
    usage: () => Promise<HarnessContext> = () => Promise.resolve(compactedUsage)
) {
    const process: CompactedProcess = { contextUsage: usage, owner };
    return process;
}
