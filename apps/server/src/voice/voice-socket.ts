import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { appProtocolHeaders, appProtocolVersion, voiceCallInputSchema } from '@haus/api';
import { type WebSocket, WebSocketServer } from 'ws';
import type { HausContext } from '../haus-api/context.ts';
import { findUserByClerkId } from '../users/haus-user.ts';
import { startVoiceCall } from './voice-call.ts';
import { readVoiceTarget } from './voice-context.ts';

interface VoiceSocketOptions {
    apiKey?: string;
    connectLive?: () => WebSocket;
    createContext(opts: { req: IncomingMessage }): HausContext;
    isAllowedOrigin(origin: string | undefined): boolean;
}

export function startVoiceSocket(server: Server, options: VoiceSocketOptions) {
    const wss = new WebSocketServer({ noServer: true, maxPayload: 40_000 });
    const callers = new Set<string>();
    const calls = new Set<Promise<void>>();
    let closing = false;
    const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname !== '/voice/call') {
            return;
        }
        void authorize(request, socket, head, url).catch(() => {
            socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        });
    };
    async function authorize(request: IncomingMessage, socket: Duplex, head: Buffer, url: URL) {
        if (
            closing ||
            !options.isAllowedOrigin(request.headers.origin) ||
            request.headers[appProtocolHeaders.protocolVersion] !== String(appProtocolVersion) ||
            !request.headers[appProtocolHeaders.productVersion]
        ) {
            throw new Error('Invalid app');
        }
        const ctx = options.createContext({ req: request });
        if (!ctx.clerkSessionToken) {
            throw new Error('Sign in required');
        }
        const identity = await ctx.clerkSessions.verify(ctx.clerkSessionToken);
        const member = await findUserByClerkId(ctx.hausDb, identity.clerkUserId);
        if (!member) {
            throw new Error('Membership required');
        }
        const scope = voiceCallInputSchema.parse(Object.fromEntries(url.searchParams));
        const target = await readVoiceTarget(ctx.hausDb, member, scope);
        if (closing || socket.destroyed || callers.has(member.id)) {
            throw new Error('Call already active');
        }
        callers.add(member.id);
        try {
            wss.handleUpgrade(request, socket, head, (client) => {
                client.on('error', () => client.terminate());
                client.once('close', () => callers.delete(member.id));
                if (!options.apiKey) {
                    client.send(
                        JSON.stringify({
                            type: 'error',
                            message: 'Voice calls need the Server OpenAI credential.',
                        })
                    );
                    client.close();
                    return;
                }
                const call = startVoiceCall(client, {
                    apiKey: options.apiKey,
                    db: ctx.hausDb,
                    delivery: ctx.agentDelivery,
                    member,
                    postCommitWork: ctx.postCommitWork,
                    scope,
                    target,
                    connectLive: options.connectLive,
                    runtime: ctx.runtime,
                }).catch(() => {
                    if (client.readyState === 1) {
                        client.send(
                            JSON.stringify({
                                type: 'error',
                                message: 'Haus could not start the call.',
                            })
                        );
                    }
                    client.close();
                });
                calls.add(call);
                void call.then(() => calls.delete(call));
            });
        } catch (error) {
            callers.delete(member.id);
            throw error;
        }
    }
    server.on('upgrade', upgrade);
    return {
        async close() {
            closing = true;
            server.off('upgrade', upgrade);
            for (const client of wss.clients) {
                client.terminate();
            }
            wss.close();
            await Promise.all(calls);
        },
    };
}
