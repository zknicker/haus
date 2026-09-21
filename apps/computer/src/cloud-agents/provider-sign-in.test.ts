import { afterAll, afterEach, expect, test } from 'bun:test';
import { makeTestRuntime, settle } from '@haus/effect';
import { TestClock } from 'effect';
import { createCursorCloudAgentProvider } from './cursor/provider.ts';
import { createRecordedCursorTransport, recordedAuth } from './cursor/recorded-transport.ts';
import type { CursorAuth, CursorTransport } from './cursor/transport.ts';
import { ProviderSignIn } from './provider-sign-in.ts';

const runtime = makeTestRuntime();
const flows: ProviderSignIn[] = [];
afterEach(async () => {
    await Promise.all(flows.splice(0).map((flow) => flow.close()));
});
afterAll(() => runtime.dispose());

const url = 'https://cursor.com/loginDeepControl?uuid=test&challenge=public';

function setup(timeoutMs?: number) {
    const transport = createRecordedCursorTransport({ auth: recordedAuth.loggedOut });
    let auth: CursorAuth = recordedAuth.loggedOut;
    let calls = 0;
    let signal: AbortSignal | undefined;
    let finish: (auth: CursorAuth) => void = () => {};
    let fail: (error: Error) => void = () => {};
    const login: CursorTransport['login'] = (options) => {
        calls++;
        signal = options.signal;
        options.onLoginUrl?.(url);
        return new Promise<CursorAuth>((resolve, reject) => {
            finish = (next) => {
                auth = next;
                resolve(next);
            };
            fail = reject;
            signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
    };
    const provider = createCursorCloudAgentProvider({
        ...transport,
        login,
        authStatus: () => Promise.resolve(auth),
    });
    const signIn = new ProviderSignIn(runtime, provider, timeoutMs);
    flows.push(signIn);
    return {
        signIn,
        approve: () => finish(recordedAuth.connected),
        reject: () => fail(new Error('provider failure containing a secret')),
        calls: () => calls,
        aborted: () => signal?.aborted,
    };
}

test('sign-in returns a browser link before approval and reuses the active attempt', async () => {
    const flow = setup();
    const [first, second] = await Promise.all([flow.signIn.connect(), flow.signIn.connect()]);
    expect(first.signIn).toMatchObject({ status: 'waiting', url });
    expect(second.signIn).toEqual(first.signIn);
    expect(flow.calls()).toBe(1);
    expect((await flow.signIn.get()).signIn).toEqual(first.signIn);
    flow.approve();
    await Bun.sleep(0);
    expect((await flow.signIn.get()).ready).toBe(true);
    expect((await flow.signIn.get()).signIn).toBeUndefined();
});

test('cancel aborts the provider wait and permits a fresh sign-in', async () => {
    const flow = setup();
    await flow.signIn.connect();
    expect((await flow.signIn.cancel()).signIn).toBeUndefined();
    expect(flow.aborted()).toBe(true);
    await flow.signIn.connect();
    expect(flow.calls()).toBe(2);
    await flow.signIn.cancel();
});

test('shutdown joins the provider wait and removes its browser link', async () => {
    const flow = setup();
    await flow.signIn.connect();
    await flow.signIn.close();
    expect(flow.aborted()).toBe(true);
    expect((await flow.signIn.get()).signIn).toBeUndefined();
});

test('expiry clears the actionable link and aborts the provider wait', async () => {
    const flow = setup(20);
    await flow.signIn.connect();
    await settle(runtime, TestClock.adjust(20));
    await Bun.sleep(0);
    expect((await flow.signIn.get()).signIn?.status).toBe('failed');
    expect((await flow.signIn.get()).signIn).toEqual({
        status: 'failed',
        message: 'This sign-in expired. Try again to get a new link.',
    });
    expect(flow.aborted()).toBe(true);
});

test('provider failures leave a retryable state without forwarding raw auth errors', async () => {
    const flow = setup();
    await flow.signIn.connect();
    flow.reject();
    await Bun.sleep(30);
    expect((await flow.signIn.get()).signIn?.status).toBe('failed');
    expect(JSON.stringify(await flow.signIn.get())).not.toContain('secret');
    await flow.signIn.connect();
    expect(flow.calls()).toBe(2);
    await flow.signIn.cancel();
});
