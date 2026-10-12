import { createHash, randomBytes } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';

interface Authorization {
    challenge: string;
    redirectUri: string;
}

export async function startControlledOAuthMcpProvider() {
    const authorizations = new Map<string, Authorization>();
    let accessToken = 'controlled-access';
    let registrations = 0;
    const handle = async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        const origin = url.origin;
        if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
            return Response.json({
                authorization_servers: [origin],
                resource: `${origin}/mcp`,
            });
        }
        if (
            url.pathname === '/.well-known/oauth-authorization-server' ||
            url.pathname === '/.well-known/openid-configuration'
        ) {
            return Response.json({
                authorization_endpoint: `${origin}/authorize`,
                authorization_response_iss_parameter_supported: true,
                code_challenge_methods_supported: ['S256'],
                grant_types_supported: ['authorization_code', 'refresh_token'],
                issuer: origin,
                registration_endpoint: `${origin}/register`,
                response_types_supported: ['code'],
                token_endpoint: `${origin}/token`,
                token_endpoint_auth_methods_supported: ['none'],
            });
        }
        if (url.pathname === '/register' && request.method === 'POST') {
            registrations += 1;
            const metadata = (await request.json()) as Record<string, unknown>;
            return Response.json({
                ...metadata,
                client_id: `controlled-client-${registrations}`,
                token_endpoint_auth_method: 'none',
            });
        }
        if (url.pathname === '/authorize') {
            return new Response('Authorize the controlled account.');
        }
        if (url.pathname === '/approve' && request.method === 'POST') {
            const form = await request.formData();
            const state = String(form.get('state') ?? '');
            const code = randomBytes(18).toString('base64url');
            authorizations.set(code, {
                challenge: String(form.get('code_challenge') ?? ''),
                redirectUri: String(form.get('redirect_uri') ?? ''),
            });
            const callback = new URL(String(form.get('redirect_uri')));
            callback.searchParams.set('code', code);
            callback.searchParams.set('state', state);
            callback.searchParams.set('iss', origin);
            return Response.redirect(callback.toString());
        }
        if (url.pathname === '/token' && request.method === 'POST') {
            const body = new URLSearchParams(await request.text());
            const code = body.get('code') ?? '';
            const authorization = authorizations.get(code);
            if (
                !authorization ||
                authorization.redirectUri !== body.get('redirect_uri') ||
                authorization.challenge !== challenge(body.get('code_verifier') ?? '')
            ) {
                return Response.json({ error: 'invalid_grant' }, { status: 400 });
            }
            authorizations.delete(code);
            return Response.json({
                access_token: accessToken,
                expires_in: 3600,
                refresh_token: 'controlled-refresh',
                token_type: 'Bearer',
            });
        }
        if (url.pathname === '/mcp' && request.method === 'POST') {
            if (request.headers.get('authorization') !== `Bearer ${accessToken}`) {
                return new Response(null, {
                    headers: {
                        'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
                    },
                    status: 401,
                });
            }
            const message = (await request.json()) as {
                id?: string | number;
                method?: string;
            };
            if (message.method === 'notifications/initialized') {
                return new Response(null, { status: 202 });
            }
            if (message.method === 'initialize') {
                return rpc(message.id, {
                    capabilities: { tools: {} },
                    protocolVersion: '2025-06-18',
                    serverInfo: { name: 'controlled@example.test', version: '1.0.0' },
                });
            }
            if (message.method === 'tools/list') {
                return rpc(message.id, {
                    tools: [
                        {
                            description: 'Echo a controlled value.',
                            inputSchema: {
                                additionalProperties: false,
                                properties: { value: { type: 'string' } },
                                required: ['value'],
                                type: 'object',
                            },
                            name: 'echo',
                            title: 'Controlled echo',
                        },
                    ],
                });
            }
        }
        return new Response('Not found', { status: 404 });
    };
    const server = createServer(async (incoming, outgoing) => {
        try {
            const chunks: Buffer[] = [];
            for await (const chunk of incoming) {
                chunks.push(Buffer.from(chunk));
            }
            const port = (server.address() as { port: number }).port;
            const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, {
                body:
                    incoming.method === 'GET' || incoming.method === 'HEAD'
                        ? undefined
                        : Buffer.concat(chunks),
                headers: incoming.headers as Record<string, string>,
                method: incoming.method,
            });
            await sendResponse(outgoing, await handle(request));
        } catch (error) {
            outgoing.statusCode = 500;
            outgoing.end(error instanceof Error ? error.message : 'Provider failed.');
        }
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const port = (server.address() as { port: number }).port;
    return {
        origin: `http://127.0.0.1:${port}`,
        registrations: () => registrations,
        stop: () => {
            accessToken = 'stopped';
            server.closeAllConnections();
            server.close();
        },
    };
}

async function sendResponse(outgoing: ServerResponse, response: Response) {
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => {
        outgoing.setHeader(name, value);
    });
    outgoing.end(Buffer.from(await response.arrayBuffer()));
}

function rpc(id: string | number | undefined, result: unknown) {
    return Response.json({ id, jsonrpc: '2.0', result });
}

function challenge(verifier: string) {
    return createHash('sha256').update(verifier).digest('base64url');
}
