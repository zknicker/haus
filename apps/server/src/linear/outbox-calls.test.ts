import { expect, test } from 'bun:test';
import { LinearOutboxCallError, linearHttpOutboxTransport } from './outbox-calls.ts';

// `token_revoke` rows carry `{ token, clientId | null }`: null is the Haus
// app's own client (HAUS_LINEAR_APP_CLIENT_ID), any other value an identity's.

function recordingFetch() {
    const sent: Record<string, string>[] = [];
    const transport = ((_url: string | URL | Request, init?: RequestInit) => {
        sent.push(Object.fromEntries(new URLSearchParams(String(init?.body))));
        return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;
    return { sent, transport };
}

test('a null client id revokes with the Haus app client', async () => {
    const { sent, transport } = recordingFetch();
    await linearHttpOutboxTransport('haus-app-client', transport).revoke({
        clientId: null,
        token: 'refresh-1',
    });
    expect(sent).toEqual([{ client_id: 'haus-app-client', token: 'refresh-1' }]);
});

test("an identity's client id is used as is", async () => {
    const { sent, transport } = recordingFetch();
    await linearHttpOutboxTransport('haus-app-client', transport).revoke({
        clientId: 'identity-client',
        token: 'refresh-2',
    });
    expect(sent).toEqual([{ client_id: 'identity-client', token: 'refresh-2' }]);
});

test('a null client id without a configured Haus app fails the row', async () => {
    const { sent, transport } = recordingFetch();
    const revoke = linearHttpOutboxTransport(null, transport).revoke({
        clientId: null,
        token: 'refresh-3',
    });
    await expect(revoke).rejects.toBeInstanceOf(LinearOutboxCallError);
    expect(sent).toEqual([]);
});
