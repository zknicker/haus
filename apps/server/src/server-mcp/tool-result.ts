interface McpToolResult {
    content: unknown[];
    isError?: unknown;
    structuredContent?: unknown;
}

/**
 * Haus Server is the MCP client, so it chooses one form of a tool result rather
 * than forwarding both. A server that returns `structuredContent` also returns the
 * same JSON serialized into a text block, for clients that read only text; the
 * Agent reads the structured value, so that duplicate leaves here. Non-text blocks
 * and error results keep everything they arrived with — an error's message usually
 * lives in its only text block.
 */
export function narrowMcpToolResult(result: unknown): unknown {
    const record = asToolResult(result);
    if (!record || record.isError === true || !hasStructuredContent(record)) {
        return result;
    }
    const content = record.content.filter((block) => !isTextBlock(block));
    return content.length === record.content.length ? result : { ...record, content };
}

function asToolResult(result: unknown): McpToolResult | null {
    if (typeof result !== 'object' || result === null) {
        return null;
    }
    const record = result as McpToolResult;
    return Array.isArray(record.content) ? record : null;
}

function hasStructuredContent(record: McpToolResult): boolean {
    return record.structuredContent !== undefined && record.structuredContent !== null;
}

function isTextBlock(block: unknown): boolean {
    return (
        typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text'
    );
}
