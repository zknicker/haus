import type { agentMcpCatalogQuerySchema } from '@haus/api';
import type * as z from 'zod';
import type { GrantedConnection } from './agent-access.ts';
import type { McpCatalogTool, McpToolDefinition } from './runtime.ts';

const SEARCH_LIMIT = 50;
const STOPWORDS = new Set(['and', 'the', 'for', 'with', 'from', 'into', 'tool', 'tools']);

/**
 * Search matches any meaningful query word against a tool's name, title, description, and
 * connection labels, ranking tools by how many distinct words they match.
 */
export function mcpCatalogResponse(
    tools: McpCatalogTool[],
    query: z.infer<typeof agentMcpCatalogQuerySchema>
) {
    if ('name' in query) {
        return { tools: tools.filter((tool) => tool.name === query.name).map(toDefinition) };
    }
    if (!('query' in query)) {
        return { tools: tools.map(toDefinition) };
    }
    const words = searchWords(query.query);
    const matches =
        words.length === 0
            ? tools
            : tools
                  .map((tool, index) => ({ index, score: matchCount(tool, words), tool }))
                  .filter((entry) => entry.score > 0)
                  .sort((a, b) => b.score - a.score || a.index - b.index)
                  .map((entry) => entry.tool);
    return {
        tools: matches.slice(0, SEARCH_LIMIT).map(({ name, title, description }) => ({
            name,
            title,
            description: description.slice(0, 2000),
        })),
        total: matches.length,
    };
}

/** The connection name, preset, and URL host an Agent may search a connection's tools by. */
export function connectionSearchText(
    connection: Pick<GrantedConnection, 'name' | 'preset' | 'url'>
) {
    return [connection.name, connection.preset?.replaceAll('-', ' '), urlHost(connection.url)]
        .filter(Boolean)
        .join(' ');
}

function toDefinition({ description, inputSchema, name, title }: McpCatalogTool) {
    return { description, inputSchema, name, title } satisfies McpToolDefinition;
}

function searchWords(query: string) {
    const words = query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 2 && !STOPWORDS.has(word));
    return [...new Set(words)];
}

function matchCount(tool: McpCatalogTool, words: string[]) {
    const text = [tool.name.replaceAll('_', ' '), tool.title, tool.description, tool.searchText]
        .join(' ')
        .toLowerCase();
    return words.filter((word) => wordForms(word).some((form) => text.includes(form))).length;
}

/** A plural query word also matches its singular stem: "issues" finds "issue". */
function wordForms(word: string) {
    return word.endsWith('s') && word.length > 3 ? [word, word.slice(0, -1)] : [word];
}

function urlHost(url: string | undefined) {
    if (!url) {
        return null;
    }
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}
