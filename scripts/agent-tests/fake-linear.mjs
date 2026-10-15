// A loopback fake of api.linear.app for Linear scenarios. Eval stacks boot
// with HAUS_LINEAR_API_ORIGIN at `fakeLinearOrigin(ports)` (scripts/eval/stack.mjs),
// so every Server-side Linear call lands here and none leaves the machine.
// It answers the Trigger catalog per access token and refuses anything else;
// every request is recorded so a scenario can prove the fake was used.

import { resolveDevPorts } from '../dev-ports.mjs';

const catalogs = new Map();
const calls = [];
let server = null;
let holders = 0;

/** The fake's origin for a stack: the port between the website and Server ports. */
export function fakeLinearOrigin(ports) {
    return `http://127.0.0.1:${ports.hausPort - 1}`;
}

/** The fake's origin for the stack this process targets (HAUS_DEV_STACK_ID). */
export function currentFakeLinearOrigin(repositoryRoot = process.cwd()) {
    return fakeLinearOrigin(resolveDevPorts({ baseEnvironment: process.env, repositoryRoot }));
}

/**
 * Serves `catalog` (the HausTriggerCatalog `data`) to `token`. Returns the
 * call log for this token and `release()`, which stops the server once no
 * scenario holds it.
 */
export function holdFakeLinear({ catalog, token }) {
    catalogs.set(token, catalog);
    holders += 1;
    if (!server) {
        const origin = new URL(currentFakeLinearOrigin());
        server = Bun.serve({
            fetch: answer,
            hostname: origin.hostname,
            port: Number(origin.port),
        });
    }
    return {
        calls: () => calls.filter((call) => call.token === token).map((call) => call.operation),
        release() {
            catalogs.delete(token);
            holders -= 1;
            if (holders === 0 && server) {
                server.stop(true);
                server = null;
            }
        },
    };
}

async function answer(request) {
    const url = new URL(request.url);
    const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/u, '');
    const body = await request.json().catch(() => null);
    const operation =
        url.pathname === '/graphql'
            ? (/(?:query|mutation)\s+(\w+)/u.exec(body?.query ?? '')?.[1] ?? 'anonymous')
            : url.pathname;
    calls.push({ operation, token });
    const catalog = catalogs.get(token);
    if (operation === 'HausTriggerCatalog' && catalog) {
        return Response.json({ data: catalog });
    }
    // Anything else would need real Linear: answer like an outage, never like a refusal.
    return new Response('fake Linear does not serve this', { status: 503 });
}
