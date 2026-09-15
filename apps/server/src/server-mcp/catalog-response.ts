import type { agentMcpCatalogQuerySchema } from '@haus/api';
import type * as z from 'zod';
import type { McpToolDefinition } from './runtime.ts';

export function mcpCatalogResponse(
    tools: McpToolDefinition[],
    query: z.infer<typeof agentMcpCatalogQuerySchema>
) {
    if ('name' in query) {
        return { tools: tools.filter((tool) => tool.name === query.name) };
    }
    if ('query' in query) {
        const words = query.query.toLowerCase().split(/\s+/u).filter(Boolean);
        const matches = tools.filter((tool) =>
            words.every((word) =>
                [tool.name, tool.title, tool.description].join(' ').toLowerCase().includes(word)
            )
        );
        return {
            tools: matches.slice(0, 50).map(({ name, title, description }) => ({
                name,
                title,
                description: description.slice(0, 2000),
            })),
            total: matches.length,
        };
    }
    return { tools };
}
