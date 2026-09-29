import { afterEach, expect, test } from 'bun:test';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';
import net from 'node:net';
import type { PushNotificationPayload } from '@haus/api';
import { exportPKCS8, generateKeyPair } from 'jose';
import { ApnsSender, type ApnsSenderOptions } from './apns-sender.ts';
import type { PushRequest } from './push-sender.ts';

const cleanups: Array<() => Promise<unknown>> = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) {
        await cleanup();
    }
});

const payload: PushNotificationPayload = {
    aps: { alert: { body: 'Ship it?', title: 'Orbit' }, sound: 'default', 'thread-id': 'chat_1' },
    chatId: 'chat_1',
    conversationChatId: 'chat_1',
    messageId: 'msg_1',
    serverId: 'srv_1',
    threadAnchorMessageId: null,
};

function request(token: string): PushRequest {
    return {
        collapseId: 'msg_1',
        device: { bundleId: 'chat.haus.ios', environment: 'sandbox', token },
        payload,
    };
}

async function listen(server: net.Server): Promise<string> {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function sender(origin: string, options: ApnsSenderOptions = {}) {
    const keys = await generateKeyPair('ES256', { extractable: true });
    const created = await ApnsSender.create(
        {
            keyId: 'KEY1234567',
            privateKey: await exportPKCS8(keys.privateKey),
            teamId: 'XJ8RZZT99R',
        },
        { origins: { production: origin, sandbox: origin }, ...options }
    );
    cleanups.push(() => created.close());
    return created;
}

/** An APNs stand-in that answers 200, never answers `hang` tokens, and counts sessions. */
async function apnsStandIn(answer: (token: string) => { reason?: string; status: number } | null) {
    const server = http2.createServer();
    const state = { requests: 0, sessions: 0 };
    server.on('session', (session) => {
        state.sessions += 1;
        cleanups.push(async () => session.destroy());
    });
    server.on('stream', (stream, headers) => {
        stream.resume();
        stream.on('end', () => {
            state.requests += 1;
            const reply = answer(String(headers[':path']).split('/').at(-1) ?? '');
            if (reply) {
                stream.respond({ ':status': reply.status });
                stream.end(reply.reason ? JSON.stringify({ reason: reply.reason }) : undefined);
            }
        });
    });
    return { origin: await listen(server), state };
}

test('a timed-out request drops the session so the next push reconnects', async () => {
    const hang = 'a'.repeat(64);
    const apns = await apnsStandIn((token) => (token === hang ? null : { status: 200 }));
    const apnsSender = await sender(apns.origin, { requestTimeoutMs: 150 });

    expect(await apnsSender.send(request(hang))).toEqual({
        kind: 'rejected',
        reason: 'APNs request timed out',
        status: null,
    });
    expect(await apnsSender.send(request('b'.repeat(64)))).toEqual({ kind: 'delivered' });
    expect(apns.state.sessions).toBe(2);
});

test('a silent connection fails in-flight pushes at the missed ping, not the request timeout', async () => {
    // Accepts TCP and never speaks HTTP/2: the dead-session shape a NAT drop leaves.
    const sockets: net.Socket[] = [];
    const silent = net.createServer((socket) => sockets.push(socket));
    const origin = await listen(silent);
    cleanups.push(async () => {
        for (const socket of sockets) {
            socket.destroy();
        }
    });
    const apnsSender = await sender(origin, { pingIntervalMs: 50, requestTimeoutMs: 5000 });

    const started = Date.now();
    const outcome = await apnsSender.send(request('c'.repeat(64)));
    expect(outcome.kind).toBe('rejected');
    expect(outcome).not.toMatchObject({ reason: 'APNs request timed out' });
    expect(Date.now() - started).toBeLessThan(2000);
    // close() cannot hang on a stream that was never answered.
    await apnsSender.close();
});

test('InvalidProviderToken disables sending until restart', async () => {
    const apns = await apnsStandIn(() => ({ reason: 'InvalidProviderToken', status: 403 }));
    const apnsSender = await sender(apns.origin);
    const logged = console.error;
    let errors = 0;
    console.error = () => {
        errors += 1;
    };
    try {
        expect(await apnsSender.send(request('d'.repeat(64)))).toEqual({
            kind: 'rejected',
            reason: 'InvalidProviderToken',
            status: 403,
        });
        expect(await apnsSender.send(request('e'.repeat(64)))).toMatchObject({
            kind: 'rejected',
            status: null,
        });
    } finally {
        console.error = logged;
    }
    expect(apns.state.requests).toBe(1);
    expect(errors).toBe(1);
});
