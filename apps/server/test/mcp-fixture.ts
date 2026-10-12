export function createMcpFixture(input: { delayMs?: number; toolName: string }) {
    return Bun.serve({
        fetch: async (request) => {
            if (input.delayMs) {
                await Bun.sleep(input.delayMs);
            }
            if (request.method !== 'POST') {
                return new Response(null, { status: 405 });
            }
            const message = (await request.json()) as {
                id?: number;
                method: string;
                params?: Record<string, unknown>;
            };
            if (message.method === 'notifications/initialized') {
                return new Response(null, { status: 202 });
            }
            const result =
                message.method === 'initialize'
                    ? {
                          capabilities: { tools: {} },
                          protocolVersion: String(message.params?.protocolVersion),
                          serverInfo: { name: 'MCP fixture', version: '1.0.0' },
                      }
                    : message.method === 'tools/list'
                      ? {
                            tools: [
                                {
                                    inputSchema: {
                                        additionalProperties: false,
                                        properties: {},
                                        type: 'object',
                                    },
                                    name: input.toolName,
                                },
                            ],
                        }
                      : message.method === 'tools/call'
                        ? { content: [{ text: 'ok', type: 'text' }] }
                        : null;
            return result === null
                ? Response.json({
                      id: message.id,
                      jsonrpc: '2.0',
                      error: { code: -32_601, message: 'Method not found' },
                  })
                : Response.json({ id: message.id, jsonrpc: '2.0', result });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
}
