import { afterAll, afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { createServer, type Server as NetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'bun';
import { AgentActivityRun } from './agent-activity-run.ts';
import type { AgentInboxItem } from './agent-inbox-item.ts';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import { readPendingInbox, readRunVisibleMessages, replacePendingInbox } from './inbox-store.ts';
import { startLoopbackProxy } from './proxy.ts';

const servers: Server<unknown>[] = [];
const netServers: NetServer[] = [];
const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());
afterEach(() => {
    for (const server of servers.splice(0)) {
        server.stop(true);
    }
    for (const server of netServers.splice(0)) {
        server.close();
    }
});
test('the loopback proxy forwards inbox reads to the canonical Server ledger', async () => {
    const requested: string[] = [];
    const forwardedAuth: string[] = [];
    const upstream = Bun.serve({
        fetch(request) {
            requested.push(new URL(request.url).pathname);
            forwardedAuth.push(request.headers.get('authorization') ?? '');
            return Response.json({ messages: [], more: false });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    servers.push(upstream);
    const proxy = startLoopbackProxy({
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    try {
        const headers = { authorization: 'Bearer local-token' };
        expect((await fetch(`${proxy.url}/api/agent/inbox`, { headers })).status).toBe(200);
        expect((await fetch(`${proxy.url}/api/agent/events`, { headers })).status).toBe(200);
        expect(
            (
                await fetch(
                    `${proxy.url}/api/agent/manual/get?topic=index&intent=read%20the%20guide&reason=choose%20the%20next%20step`,
                    { headers }
                )
            ).status
        ).toBe(200);
        expect(requested).toEqual([
            '/api/agent/inbox',
            '/api/agent/events',
            '/api/agent/manual/get',
        ]);
        expect(forwardedAuth).toEqual([
            'Bearer runner-token',
            'Bearer runner-token',
            'Bearer runner-token',
        ]);
    } finally {
        proxy.close();
    }
});
test('projects structured message and Browser proxy boundaries without request details', async () => {
    const activity: Array<{ category: string; phase: string }> = [];
    const upstream = Bun.serve({
        fetch() {
            return Response.json({ messages: [], more: false });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    servers.push(upstream);
    const proxy = startLoopbackProxy({
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    proxy.setActivityRun(
        new AgentActivityRun(runtime, ({ category, phase }) => activity.push({ category, phase }))
    );
    try {
        const headers = { authorization: 'Bearer local-token' };
        await fetch(`${proxy.url}/api/agent/events`, { headers });
        await fetch(`${proxy.url}/api/agent/history?target=%23general`, { headers });
        await fetch(`${proxy.url}/api/agent/messages/search?q=private`, { headers });
        await fetch(`${proxy.url}/api/agent/browser`, { headers });
        expect(activity).toEqual([
            { category: 'checking_messages', phase: 'started' },
            { category: 'checking_messages', phase: 'completed' },
            { category: 'checking_messages', phase: 'started' },
            { category: 'checking_messages', phase: 'completed' },
            { category: 'checking_messages', phase: 'started' },
            { category: 'checking_messages', phase: 'completed' },
            { category: 'browsing', phase: 'started' },
            { category: 'browsing', phase: 'completed' },
        ]);
    } finally {
        proxy.close();
    }
});
test('the loopback proxy preserves Agent API query parameters', async () => {
    let upstreamUrl = '';
    const upstream = Bun.serve({
        fetch(request) {
            upstreamUrl = request.url;
            return Response.json({ ok: true });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    servers.push(upstream);
    const proxy = startLoopbackProxy({
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    try {
        const response = await fetch(`${proxy.url}/api/agent/history?target=%23general&limit=25`, {
            headers: { authorization: 'Bearer local-token' },
        });
        expect(response.status).toBe(200);
        expect(new URL(upstreamUrl).search).toBe('?target=%23general&limit=25');
    } finally {
        proxy.close();
    }
});
test('serves cached message bodies locally when the Server fetch is unavailable', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-proxy-local-first-'));
    const location = { agentId: 'agt_local', dataRoot, serverId: 'srv_local' };
    const cached = inboxItem('msg_cached', 1);
    cached.message = agentMessage(cached);
    cached.threadFollowReactivated = true;
    await replacePendingInbox(location, [cached]);
    const proxy = startLoopbackProxy({
        ...location,
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        runId: 'run_local',
        serverOrigin: 'http://127.0.0.1:1',
    });
    try {
        const response = await fetch(`${proxy.url}/api/agent/events`, {
            headers: { authorization: 'Bearer local-token' },
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            messages: [
                {
                    message: { content: 'msg_cached', id: 'msg_cached' },
                    threadFollowReactivated: true,
                },
            ],
        });
        expect(await readPendingInbox(location)).toEqual([]);
        expect(await readRunVisibleMessages(location, 'run_local')).toEqual([
            { chatId: cached.chatId, id: cached.id, sequence: cached.sequence },
        ]);
    } finally {
        proxy.close();
        await rm(dataRoot, { force: true, recursive: true });
    }
});
test('local pulls preserve the canonical more signal beyond the cached window', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-proxy-window-'));
    const location = { agentId: 'agt_window', dataRoot, serverId: 'srv_window' };
    const cached = Array.from({ length: 50 }, (_, index) => {
        const item = inboxItem(`msg_${index}`, index + 1);
        item.message = agentMessage(item);
        return item;
    });
    await replacePendingInbox(location, cached, 60);
    const proxy = startLoopbackProxy({
        ...location,
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        runId: 'run_window',
        serverOrigin: 'http://127.0.0.1:1',
    });
    try {
        const headers = { authorization: 'Bearer local-token' };
        const first = await fetch(`${proxy.url}/api/agent/events`, { headers });
        expect(await first.json()).toMatchObject({ more: true });
        const second = await fetch(`${proxy.url}/api/agent/events`, { headers });
        expect(await second.json()).toMatchObject({ more: true });
    } finally {
        proxy.close();
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('local proxy exposes successive message-check pages until the inbox drains', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-proxy-pages-'));
    const location = { agentId: 'agt_pages', dataRoot, serverId: 'srv_pages' };
    const cached = Array.from({ length: 80 }, (_, index) => {
        const item = inboxItem(`msg_page_${index}`, index + 1);
        item.message = agentMessage(item);
        return item;
    });
    await replacePendingInbox(location, cached, cached.length);
    const proxy = startLoopbackProxy({
        ...location,
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        runId: 'run_pages',
        serverOrigin: 'http://127.0.0.1:1',
    });
    try {
        const headers = { authorization: 'Bearer local-token' };
        const first = await fetch(`${proxy.url}/api/agent/events`, { headers });
        const second = await fetch(`${proxy.url}/api/agent/events`, { headers });
        const firstBody = (await first.json()) as {
            messages: unknown[];
            more: boolean;
        };
        const secondBody = (await second.json()) as {
            messages: unknown[];
            more: boolean;
        };

        expect(firstBody.messages).toHaveLength(40);
        expect(firstBody.more).toBe(true);
        expect(secondBody.messages).toHaveLength(40);
        expect(secondBody.more).toBe(false);
        expect(await readPendingInbox(location)).toEqual([]);
    } finally {
        proxy.close();
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('a reachable local visibility receipt lands before the pull response', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-proxy-attest-order-'));
    const location = { agentId: 'agt_order', dataRoot, serverId: 'srv_order' };
    const cached = inboxItem('msg_order', 1);
    cached.message = agentMessage(cached);
    await replacePendingInbox(location, [cached]);
    let receiptCommitted = false;
    const upstream = Bun.serve({
        async fetch(request) {
            if (new URL(request.url).pathname === '/api/agent/events/visible') {
                await new Promise((resolve) => setTimeout(resolve, 25));
                receiptCommitted = true;
                return Response.json({ accepted: [cached.id] });
            }
            return Response.json({ messages: [], more: false });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    servers.push(upstream);
    const proxy = startLoopbackProxy({
        ...location,
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        runId: 'run_order',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    try {
        const response = await fetch(`${proxy.url}/api/agent/events`, {
            headers: { authorization: 'Bearer local-token' },
        });
        expect(response.status).toBe(200);
        expect(receiptCommitted).toBe(true);
    } finally {
        proxy.close();
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('consumes only messages made visible by Agent API responses', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-proxy-inbox-'));
    const location = { agentId: 'agt_proxy', dataRoot, serverId: 'srv_proxy' };
    const greeting = inboxItem('msg_greeting', 1);
    greeting.message = agentMessage(greeting);
    const oldHistory = inboxItem('msg_old', 1);
    const productTask = inboxItem('msg_product', 2);
    const heldContext = inboxItem('msg_held', 3);
    await replacePendingInbox(location, [greeting, productTask, heldContext]);
    const upstream = Bun.serve({
        async fetch(request) {
            const pathname = new URL(request.url).pathname;
            if (pathname === '/api/agent/events/visible') {
                const body = (await request.json()) as { messages: Array<{ id: string }> };
                return Response.json({
                    accepted: body.messages
                        .map((message) => message.id)
                        .filter((id) => id !== oldHistory.id),
                });
            }
            if (pathname === '/api/agent/events') {
                return Response.json({
                    messages: [{ message: agentMessage(greeting), target: greeting.target }],
                    more: false,
                });
            }
            if (pathname === '/api/agent/history') {
                return Response.json({
                    has_more: false,
                    has_newer: false,
                    has_older: false,
                    last_read: { after: 0, unread_after: -1 },
                    messages: [agentMessage(oldHistory), agentMessage(productTask)],
                    target: productTask.target,
                });
            }
            return Response.json({
                continueAnywaySuggested: false,
                formalMentionCount: 0,
                newMessageCount: 1,
                omittedMessageCount: 0,
                reholdCount: 1,
                shownMessages: [agentMessage(heldContext)],
                state: 'held',
            });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    servers.push(upstream);
    const proxy = startLoopbackProxy({
        ...location,
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        runId: 'run_proxy',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    try {
        const response = await fetch(`${proxy.url}/api/agent/events`, {
            headers: { authorization: 'Bearer local-token' },
        });
        expect(response.status).toBe(200);
        expect(await readPendingInbox(location)).toEqual([productTask, heldContext]);

        await fetch(`${proxy.url}/api/agent/history?target=%23product`, {
            headers: { authorization: 'Bearer local-token' },
        });
        expect(await readPendingInbox(location)).toEqual([heldContext]);

        await fetch(`${proxy.url}/api/agent/messages/send`, {
            body: '{}',
            headers: {
                authorization: 'Bearer local-token',
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        expect(await readPendingInbox(location)).toEqual([]);
        expect(await readRunVisibleMessages(location, 'run_proxy')).toEqual([
            { chatId: greeting.chatId, id: greeting.id, sequence: greeting.sequence },
            { chatId: oldHistory.chatId, id: oldHistory.id, sequence: oldHistory.sequence },
            { chatId: productTask.chatId, id: productTask.id, sequence: productTask.sequence },
            { chatId: heldContext.chatId, id: heldContext.id, sequence: heldContext.sequence },
        ]);
    } finally {
        proxy.close();
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('returns a committed send when its visibility receipt is unavailable', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-proxy-send-receipt-'));
    const location = { agentId: 'agt_proxy', dataRoot, serverId: 'srv_proxy' };
    const shown = inboxItem('msg_shown', 1);
    await replacePendingInbox(location, [shown]);
    const upstream = Bun.serve({
        fetch(request) {
            if (new URL(request.url).pathname === '/api/agent/events/visible') {
                return Response.json({ code: 'UNAVAILABLE' }, { status: 409 });
            }
            return Response.json({
                continueAnywaySuggested: false,
                formalMentionCount: 0,
                newMessageCount: 1,
                omittedMessageCount: 0,
                reholdCount: 1,
                shownMessages: [agentMessage(shown)],
                state: 'held',
            });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    servers.push(upstream);
    const proxy = startLoopbackProxy({
        ...location,
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        runId: 'run_send',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    try {
        const response = await fetch(`${proxy.url}/api/agent/messages/send`, {
            body: '{}',
            headers: {
                authorization: 'Bearer local-token',
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        expect(response.status).toBe(200);
        expect((await response.json()) as { state: string }).toMatchObject({ state: 'held' });
        expect(await readPendingInbox(location)).toEqual([]);
        expect(await readRunVisibleMessages(location, 'run_send')).toEqual([
            { chatId: shown.chatId, id: shown.id, sequence: shown.sequence },
        ]);
    } finally {
        proxy.close();
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('keeps one local proxy while rotating per-turn Server authority', async () => {
    const seen: string[] = [];
    const upstream = Bun.serve({
        fetch(request) {
            seen.push(request.headers.get('authorization') ?? '');
            return Response.json({ messages: [], more: false });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    servers.push(upstream);
    const proxy = startLoopbackProxy({
        proxyToken: 'local-token',
        runnerToken: 'runner-one',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    try {
        const request = () =>
            fetch(`${proxy.url}/api/agent/inbox`, {
                headers: { authorization: 'Bearer local-token' },
            });
        expect((await request()).status).toBe(200);
        proxy.clearRunnerToken();
        expect((await request()).status).toBe(409);
        proxy.setRunnerToken('runner-two');
        expect((await request()).status).toBe(200);
        expect(seen).toEqual(['Bearer runner-one', 'Bearer runner-two']);
    } finally {
        proxy.close();
    }
});

test('counts a send whose upstream response is lost after connection', async () => {
    const upstream = createServer((socket) => {
        socket.once('data', () => socket.destroy());
    });
    netServers.push(upstream);
    const upstreamPort = await listen(upstream);
    const proxy = startLoopbackProxy({
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        serverOrigin: `http://127.0.0.1:${upstreamPort}`,
    });
    try {
        expect((await sendThrough(proxy.url)).status).toBe(502);
        expect(proxy.sendCount()).toBe(1);
    } finally {
        proxy.close();
    }
});

test('does not count a send rejected before an upstream connection', async () => {
    const unavailable = createServer();
    const upstreamPort = await listen(unavailable);
    await new Promise<void>((resolve, reject) => {
        unavailable.close((error) => (error ? reject(error) : resolve()));
    });
    netServers.splice(netServers.indexOf(unavailable), 1);
    const proxy = startLoopbackProxy({
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        serverOrigin: `http://127.0.0.1:${upstreamPort}`,
    });
    try {
        expect((await sendThrough(proxy.url)).status).toBe(502);
        expect(proxy.sendCount()).toBe(0);
    } finally {
        proxy.close();
    }
});

test('forwards a bodyless mutation with neither a body nor a content-type', async () => {
    const forwarded: Array<{ body: string; contentType: string | null; method: string }> = [];
    const upstream = Bun.serve({
        async fetch(request) {
            forwarded.push({
                body: await request.text(),
                contentType: request.headers.get('content-type'),
                method: request.method,
            });
            return Response.json({ ok: true });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    servers.push(upstream);
    const proxy = startLoopbackProxy({
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    try {
        const headers = { authorization: 'Bearer local-token' };
        await fetch(`${proxy.url}/api/agent/triggers/trg_one/disable`, {
            headers,
            method: 'POST',
        });
        await fetch(`${proxy.url}/api/agent/triggers/trg_one`, { headers, method: 'DELETE' });
        await fetch(`${proxy.url}/api/agent/triggers`, {
            body: '{"title":"Deploy finished"}',
            headers: { ...headers, 'content-type': 'application/json' },
            method: 'POST',
        });
        expect(forwarded).toEqual([
            { body: '', contentType: null, method: 'POST' },
            { body: '', contentType: null, method: 'DELETE' },
            {
                body: '{"title":"Deploy finished"}',
                contentType: 'application/json',
                method: 'POST',
            },
        ]);
    } finally {
        proxy.close();
    }
});

test('a pending fire routes the whole pull upstream and never attests its fire id', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-proxy-automation-'));
    const location = { agentId: 'agt_fire', dataRoot, serverId: 'srv_fire' };
    const fire = automationInboxItem('trf_41c2d8e9');
    const cached = inboxItem('msg_cached', 2);
    cached.message = agentMessage(cached);
    await replacePendingInbox(location, [fire, cached]);
    const attested: string[][] = [];
    const upstream = Bun.serve({
        async fetch(request) {
            const pathname = new URL(request.url).pathname;
            if (pathname === '/api/agent/events/visible') {
                const body = (await request.json()) as { messages: Array<{ id: string }> };
                attested.push(body.messages.map((entry) => entry.id));
                return Response.json({ accepted: body.messages.map((entry) => entry.id) });
            }
            return Response.json({
                automations: [
                    {
                        content: fire.content,
                        createdAt: fire.createdAt,
                        id: fire.id,
                        senderHandle: 'trigger',
                        senderType: 'trigger',
                        target: fire.target,
                    },
                ],
                messages: [{ message: agentMessage(cached), target: cached.target }],
                more: false,
            });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    servers.push(upstream);
    const proxy = startLoopbackProxy({
        ...location,
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        runId: 'run_fire',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    try {
        const response = await fetch(`${proxy.url}/api/agent/events`, {
            headers: { authorization: 'Bearer local-token' },
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            automations: [{ id: 'trf_41c2d8e9', senderType: 'trigger' }],
        });
        expect(attested).toEqual([['msg_cached']]);
        expect(await readPendingInbox(location)).toEqual([]);
        expect(await readRunVisibleMessages(location, 'run_fire')).toEqual([
            { chatId: cached.chatId, id: cached.id, sequence: cached.sequence },
        ]);
    } finally {
        proxy.close();
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('the local-first pull answers with the automations array the Agent CLI expects', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-proxy-shape-'));
    const location = { agentId: 'agt_shape', dataRoot, serverId: 'srv_shape' };
    const cached = inboxItem('msg_shape', 1);
    cached.message = agentMessage(cached);
    await replacePendingInbox(location, [cached]);
    const proxy = startLoopbackProxy({
        ...location,
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        runId: 'run_shape',
        serverOrigin: 'http://127.0.0.1:1',
    });
    try {
        const response = await fetch(`${proxy.url}/api/agent/events`, {
            headers: { authorization: 'Bearer local-token' },
        });
        expect(await response.json()).toMatchObject({ automations: [], more: false });
    } finally {
        proxy.close();
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('a pending task assignment routes the whole pull upstream like a fire', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-proxy-assignment-'));
    const location = { agentId: 'agt_assign', dataRoot, serverId: 'srv_assign' };
    const assignment: AgentInboxItem = {
        chatId: 'cht_proxy',
        content: '[Haus task assignment task=#7 target=#general assignedBy=@operator] Ship it',
        createdAt: new Date(Date.UTC(2026, 7, 4, 0, 0, 1)).toISOString(),
        id: 'task-assign:msg_1a2b3c4d5e6f:3',
        mentioned: true,
        senderHandle: 'haus',
        senderType: 'system',
        sequence: 1,
        target: '#general',
    };
    const cached = inboxItem('msg_cached', 2);
    cached.message = agentMessage(cached);
    await replacePendingInbox(location, [assignment, cached]);
    const attested: string[][] = [];
    const upstream = Bun.serve({
        async fetch(request) {
            const pathname = new URL(request.url).pathname;
            if (pathname === '/api/agent/events/visible') {
                const body = (await request.json()) as { messages: Array<{ id: string }> };
                attested.push(body.messages.map((entry) => entry.id));
                return Response.json({ accepted: body.messages.map((entry) => entry.id) });
            }
            return Response.json({
                automations: [
                    {
                        content: assignment.content,
                        createdAt: assignment.createdAt,
                        id: assignment.id,
                        senderHandle: 'haus',
                        senderType: 'system',
                        target: assignment.target,
                    },
                ],
                messages: [{ message: agentMessage(cached), target: cached.target }],
                more: false,
            });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    servers.push(upstream);
    const proxy = startLoopbackProxy({
        ...location,
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        runId: 'run_assign',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    try {
        const response = await fetch(`${proxy.url}/api/agent/events`, {
            headers: { authorization: 'Bearer local-token' },
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            automations: [{ id: assignment.id, senderHandle: 'haus', senderType: 'system' }],
        });
        // The assignment key never enters message-visibility attestation.
        expect(attested).toEqual([['msg_cached']]);
        expect(await readPendingInbox(location)).toEqual([]);
    } finally {
        proxy.close();
        await rm(dataRoot, { force: true, recursive: true });
    }
});

function automationInboxItem(id: string): AgentInboxItem {
    return {
        chatId: 'cht_proxy',
        content: `\u26a1 Trigger: Sentry alerts\nfire=${id}`,
        createdAt: new Date(Date.UTC(2026, 7, 4, 0, 0, 1)).toISOString(),
        id,
        senderHandle: 'trigger',
        senderType: 'trigger',
        sequence: 1,
        target: '#general',
    };
}

async function listen(server: NetServer): Promise<number> {
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return (server.address() as AddressInfo).port;
}

function sendThrough(proxyUrl: string) {
    return fetch(`${proxyUrl}/api/agent/messages/send`, {
        body: '{}',
        headers: {
            authorization: 'Bearer local-token',
            'content-type': 'application/json',
        },
        method: 'POST',
    });
}

function inboxItem(id: string, sequence: number): AgentInboxItem {
    return {
        chatId: 'cht_proxy',
        content: id,
        createdAt: new Date(Date.UTC(2026, 7, 4, 0, 0, sequence)).toISOString(),
        id,
        senderHandle: 'operator',
        senderType: 'human',
        sequence,
        target: sequence === 1 ? 'dm:@operator' : '#product',
    };
}

function agentMessage(item: AgentInboxItem) {
    return {
        attachments: [],
        author: { id: 'usr_operator', kind: 'user', label: 'Operator', metadata: {} },
        body_kind: 'text',
        chat_id: item.chatId,
        content: item.content,
        created_at: item.createdAt,
        deleted_at: null,
        delivery_id: null,
        id: item.id,
        metadata: {},
        nonce: null,
        role: 'user',
        sender: { description: null, handle: item.senderHandle, type: item.senderType },
        sequence: item.sequence,
    };
}
