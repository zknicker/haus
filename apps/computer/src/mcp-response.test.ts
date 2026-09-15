import { expect, test } from 'bun:test';
import { readProxyResponse } from './proxy-mcp.ts';

test('MCP proxy bounds upstream bytes and cancels oversized response streams', async () => {
    let cancelled = false;
    const response = new Response(
        new ReadableStream({
            pull(controller) {
                controller.enqueue(new Uint8Array(1024 * 1024 + 1));
            },
            cancel() {
                cancelled = true;
            },
        })
    );
    await expect(
        readProxyResponse(new Request('http://localhost/api/agent/mcp/invoke'), response)
    ).rejects.toThrow('size limit');
    expect(cancelled).toBe(true);
    expect(
        await readProxyResponse(
            new Request('http://localhost/api/agent/mcp/tools'),
            Response.json({ tools: [] })
        )
    ).toBe('{"tools":[]}');
});
