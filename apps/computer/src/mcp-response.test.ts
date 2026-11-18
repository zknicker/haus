import { expect, test } from 'bun:test';
import { readProxyResponse } from './proxy-mcp.ts';

function endlessBody(onCancel: () => void) {
    return new ReadableStream({
        pull(controller) {
            controller.enqueue(new Uint8Array(1024 * 1024 + 1));
        },
        cancel: onCancel,
    });
}

test('MCP proxy bounds upstream bytes and answers oversize with a typed error', async () => {
    let cancelled = false;
    const failure = await readProxyResponse(
        new Request('http://localhost/api/agent/mcp/invoke'),
        new Response(
            endlessBody(() => {
                cancelled = true;
            })
        )
    );
    expect(cancelled).toBe(true);
    expect(failure).toBeInstanceOf(Response);
    const response = failure as Response;
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
        code: 'MCP_UNAVAILABLE',
        message: 'Server MCP response exceeded its 1 MiB size limit. Narrow the request.',
    });
    expect(
        await readProxyResponse(
            new Request('http://localhost/api/agent/mcp/tools'),
            Response.json({ tools: [] })
        )
    ).toBe('{"tools":[]}');
});

test('proxy turns a broken Server body into a typed error naming the status', async () => {
    const broken = new Response(
        new ReadableStream({
            pull(controller) {
                controller.error(new Error('socket reset'));
            },
        }),
        { status: 200 }
    );
    const failure = (await readProxyResponse(
        new Request('http://localhost/api/agent/messages/send'),
        broken
    )) as Response;
    expect(await failure.json()).toEqual({
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'The Server response could not be read (HTTP 200).',
    });
});
