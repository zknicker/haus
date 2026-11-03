// A local HTTP MCP server the scenarios fully control: fixtures are defined per
// record key, and every tools/call is logged, so an MCP scenario can gate on
// whether the private lookup actually happened — not on model prose. Ported
// from the Playwright agent-e2e support lane.

import { createServer } from 'node:http';

/**
 * `recent` also exposes `list_recent_audit_records`, which returns every defined
 * record in definition order, for scenarios where an Agent watches the ledger
 * without being told a key (the heartbeat evals). Off by default so the lookup-only
 * scenarios keep their one-tool server.
 */
export async function startControlledMcp({ recent = false } = {}) {
    /** @type {Array<{ caller: string | null, key: string | null, tool: string }>} */
    const calls = [];
    /** @type {Map<string, { owner: string, title: string }>} */
    const records = new Map();

    const server = createServer(async (request, response) => {
        if (request.method !== 'POST') {
            response.writeHead(405).end();
            return;
        }

        const message = JSON.parse(await readBody(request));
        if (message.id === undefined) {
            // Notifications get no response body.
            response.writeHead(202).end();
            return;
        }

        // A path suffix (`/mcp/<caller>`) names the caller: each Agent that needs
        // attributable calls gets its own connection URL from `urlFor`.
        const caller = (request.url ?? '').split('?')[0].split('/').filter(Boolean)[1] ?? null;
        const result = respond(message, records, calls, recent, caller);
        // An unknown method is a JSON-RPC error, never a null result: the Server's
        // client probes newer protocol methods during version negotiation and
        // rejects `result: null` as a malformed response.
        const reply = result
            ? { id: message.id, jsonrpc: '2.0', result }
            : {
                  error: { code: -32_601, message: `Method not found: ${message.method}` },
                  id: message.id,
                  jsonrpc: '2.0',
              };
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(reply));
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Controlled MCP did not bind a TCP port.');
    }

    return {
        calls,
        // Bun's `closeAllConnections` already stops the listener, so an
        // already-stopped server is a clean shutdown here, not a failure.
        close: async () => {
            server.closeAllConnections();
            if (!server.listening) {
                return;
            }
            await new Promise((resolve, reject) =>
                server.close((error) =>
                    error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve()
                )
            );
        },
        define: (key, record) => records.set(key, record),
        url: `http://127.0.0.1:${address.port}/mcp`,
        /** The same server under a caller-named path, so its calls log who made them. */
        urlFor: (caller) => `http://127.0.0.1:${address.port}/mcp/${caller}`,
    };
}

const lookupTool = {
    description:
        'Look up one private audit record by its exact key. Use this whenever the user asks about an Audit Ledger record.',
    inputSchema: {
        additionalProperties: false,
        properties: { key: { type: 'string' } },
        required: ['key'],
        type: 'object',
    },
    name: 'lookup_audit_record',
};

const recentTool = {
    description:
        'List the most recent private audit records, newest last, each with its key, title, owner, and status. Use this to see what is new in the Audit Ledger.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'list_recent_audit_records',
};

function respond(message, records, calls, recent, caller) {
    switch (message.method) {
        case 'initialize':
            return {
                capabilities: { tools: {} },
                protocolVersion: message.params?.protocolVersion,
                serverInfo: { name: 'Agent Test Audit Ledger', version: '1.0.0' },
            };
        case 'ping':
            return {};
        case 'tools/list':
            return { tools: recent ? [lookupTool, recentTool] : [lookupTool] };
        case 'tools/call':
            return message.params?.name === recentTool.name
                ? recentResult(records, calls, caller)
                : lookupResult(message, records, calls, caller);
        default:
            return null;
    }
}

function lookupResult(message, records, calls, caller) {
    const key = message.params?.arguments?.key ?? '';
    calls.push({ caller, key, tool: lookupTool.name });
    const record = records.get(key);
    return {
        content: [
            {
                text: record
                    ? JSON.stringify({ key, ...record })
                    : JSON.stringify({ error: 'not_found', key }),
                type: 'text',
            },
        ],
    };
}

function recentResult(records, calls, caller) {
    calls.push({ caller, key: null, tool: recentTool.name });
    const listed = [...records.entries()].map(([key, record]) => ({ key, ...record }));
    return { content: [{ text: JSON.stringify({ records: listed }), type: 'text' }] };
}

async function readBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}
