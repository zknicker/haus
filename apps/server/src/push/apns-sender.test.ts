import { afterAll, beforeAll, expect, test } from 'bun:test';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';
import type { PushNotificationPayload } from '@haus/api';
import { exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { ApnsSender } from './apns-sender.ts';
import type { PushRequest } from './push-sender.ts';

interface Received {
    body: string;
    headers: http2.IncomingHttpHeaders;
}

/** Answers per device token, like APNs would. */
const answers = new Map<string, { reason?: string; status: number }>();
const received: Received[] = [];
let server: http2.Http2Server;
let sender: ApnsSender;
let publicKey: CryptoKey;
let clock = Date.UTC(2026, 8, 29, 12, 0, 0);

beforeAll(async () => {
    server = http2.createServer();
    server.on('stream', (stream, headers) => {
        let body = '';
        stream.setEncoding('utf8');
        stream.on('data', (chunk: string) => {
            body += chunk;
        });
        stream.on('end', () => {
            received.push({ body, headers });
            const token = String(headers[':path']).split('/').at(-1) ?? '';
            const answer = answers.get(token) ?? { status: 200 };
            stream.respond({ ':status': answer.status });
            stream.end(answer.reason ? JSON.stringify({ reason: answer.reason }) : undefined);
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const keys = await generateKeyPair('ES256', { extractable: true });
    publicKey = keys.publicKey;
    sender = await ApnsSender.create(
        {
            keyId: 'KEY1234567',
            privateKey: await exportPKCS8(keys.privateKey),
            teamId: 'XJ8RZZT99R',
        },
        { now: () => clock, origins: { production: origin, sandbox: origin } }
    );
});

afterAll(async () => {
    await sender.close();
    await new Promise((resolve) => server.close(resolve));
});

const payload: PushNotificationPayload = {
    aps: {
        alert: { body: 'Ship it?', title: 'Orbit in #launch' },
        'mutable-content': 1,
        sound: 'default',
        'thread-id': 'chat_1',
    },
    chatId: 'chat_1',
    conversation: { kind: 'channel', name: 'launch' },
    conversationChatId: 'chat_1',
    messageId: 'msg_1',
    reason: 'dm',
    sender: { avatarUrl: null, id: 'agt_orbit', kind: 'agent', name: 'Orbit' },
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

test('posts an alert push with the APNs headers and a signed provider token', async () => {
    expect(await sender.send(request('a'.repeat(64)))).toEqual({ kind: 'delivered' });
    const last = received.at(-1) as Received;
    expect(last.headers).toMatchObject({
        ':method': 'POST',
        ':path': `/3/device/${'a'.repeat(64)}`,
        'apns-collapse-id': 'msg_1',
        'apns-priority': '10',
        'apns-push-type': 'alert',
        'apns-topic': 'chat.haus.ios',
    });
    expect(JSON.parse(last.body)).toEqual(payload);
    const bearer = String(last.headers.authorization).replace(/^bearer /u, '');
    await jwtVerify(bearer, publicKey, { issuer: 'XJ8RZZT99R' });
});

test('a gone token is device-gone; throttling and refusals are only reported', async () => {
    answers.set('b'.repeat(64), { reason: 'Unregistered', status: 410 });
    answers.set('c'.repeat(64), { reason: 'BadDeviceToken', status: 400 });
    answers.set('d'.repeat(64), { reason: 'TooManyRequests', status: 429 });
    answers.set('e'.repeat(64), { reason: 'DeviceTokenNotForTopic', status: 400 });
    answers.set('f'.repeat(64), { reason: 'InternalServerError', status: 500 });

    expect(await sender.send(request('b'.repeat(64)))).toEqual({
        kind: 'device-gone',
        reason: 'Unregistered',
    });
    expect(await sender.send(request('c'.repeat(64)))).toEqual({
        kind: 'device-gone',
        reason: 'BadDeviceToken',
    });
    expect(await sender.send(request('d'.repeat(64)))).toEqual({
        kind: 'rejected',
        reason: 'TooManyRequests',
        status: 429,
    });
    expect(await sender.send(request('e'.repeat(64)))).toEqual({
        kind: 'rejected',
        reason: 'DeviceTokenNotForTopic',
        status: 400,
    });
    const before = received.length;
    expect(await sender.send(request('f'.repeat(64)))).toEqual({
        kind: 'rejected',
        reason: 'InternalServerError',
        status: 500,
    });
    // One attempt per push: no retry storm.
    expect(received.length).toBe(before + 1);
});

test('an expired provider token is re-minted, but never within 20 minutes of the last mint', async () => {
    const token = '1'.repeat(64);
    answers.set(token, { reason: 'ExpiredProviderToken', status: 403 });
    await sender.send(request(token));
    const young = String(received.at(-1)?.headers.authorization);
    await sender.send(request(token));
    expect(String(received.at(-1)?.headers.authorization)).toBe(young);

    clock += 21 * 60 * 1000;
    await sender.send(request(token));
    answers.delete(token);
    await sender.send(request(token));
    expect(String(received.at(-1)?.headers.authorization)).not.toBe(young);
});
