import type { SDKControlGetContextUsageResponse } from '@anthropic-ai/claude-agent-sdk';
import type { ContextRows, HarnessContext } from '../turn/context-snapshot.ts';

type ClaudeContextRow = SDKControlGetContextUsageResponse['categories'][number];

export function claudeHarnessContext(
    usage: Pick<SDKControlGetContextUsageResponse, 'categories' | 'rawMaxTokens'>,
    modelWindow: number | null
) {
    const rows = { conversation: 0, memory: 0, skills: 0, systemPrompt: 0, tools: 0 };
    let buffer = 0;
    for (const row of usage.categories) {
        if (row.kind === 'buffer') {
            buffer += row.tokens;
        } else if (row.kind === 'used') {
            rows[rowKey(row)] += row.tokens;
        }
    }
    const counted: ContextRows = rows;
    const context: HarnessContext = {
        compactAtTokens: usage.rawMaxTokens - buffer,
        contextWindow: Math.max(modelWindow ?? 0, usage.rawMaxTokens),
        kind: 'counted',
        rows: counted,
    };
    return context;
}

function rowKey(row: ClaudeContextRow) {
    switch (row.id) {
        case 'system_prompt':
            return 'systemPrompt';
        case 'system_tools':
        case 'mcp_tools':
        case 'mcp_instructions':
            return 'tools';
        case 'skills':
        case 'custom_agents':
            return 'skills';
        case 'memory_files':
            return 'memory';
        default:
            return 'conversation';
    }
}
