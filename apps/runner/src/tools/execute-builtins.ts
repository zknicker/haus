const argsInputSchema = {
    additionalProperties: false,
    properties: {
        args: {
            items: { maxLength: 32_768, type: 'string' },
            maxItems: 100,
            minItems: 1,
            type: 'array',
        },
    },
    required: ['args'],
    type: 'object',
} as const;

export const browserTool = {
    description:
        'Use the Chrome browser selected in your machine’s Browser settings. Pass agent-browser command arguments, for example ["tab","new","https://example.com"], ["snapshot","-i"], ["click","@e1"]. Agents share signed-in accounts and tabs. Create your own tab and operate only on your own tabs; leave service and other agents’ tabs alone. Screenshots and PDFs are written on the machine; view them with your edit tool.',
    inputSchema: argsInputSchema,
    name: 'browser',
    title: 'Browser',
} as const;

export const desktopTool = {
    description:
        'Use the macOS desktop of your machine through agent-desktop. Pass one command’s arguments, for example ["skills","get","desktop"], ["snapshot","--app","Finder","-i"], ["click","@s1:e8"]. Read `skills get desktop` before first use. Looking never asks. The first click or type in a chat asks a person there; until they answer the call is refused, so end your turn and an inbox item brings the answer. Screenshots are written on the machine; view them with your edit tool.',
    inputSchema: argsInputSchema,
    name: 'desktop',
    title: 'Desktop',
} as const;

export const builtinTools = [browserTool, desktopTool] as const;

export function findBuiltinTool(name: string) {
    return builtinTools.find((tool) => tool.name === name) ?? null;
}

export function withBuiltinTools(
    query: string,
    result: { tools: { description: string; name: string; title: string | null }[]; total: number }
) {
    const needle = query.trim().toLowerCase();
    const matches = builtinTools
        .filter(
            (tool) =>
                needle.length === 0 ||
                `${tool.name} ${tool.description}`.toLowerCase().includes(needle)
        )
        .map(({ description, name, title }) => ({ description, name, title }));
    if (matches.length === 0) {
        return result;
    }
    return {
        tools: [...matches, ...result.tools].slice(0, 50),
        total: result.total + matches.length,
    };
}
