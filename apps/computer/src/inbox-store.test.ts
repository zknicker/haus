import { beforeEach, expect, test } from 'bun:test';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentInboxItem } from './agent-inbox-item.ts';
import { noticePath, writePendingNotice } from './delivery.ts';
import {
    acceptRunInbox,
    consumeServedAutomations,
    consumeVisibleMessages,
    isAutomationInboxItem,
    prepareRunReplay,
    readPendingInbox,
    readRunVisibleMessages,
    recordRunVisibleMessages,
    reofferPendingMessages,
    replacePendingInbox,
} from './inbox-store.ts';

let dataRoot: string;
const location = () => ({
    agentId: 'agt_inbox',
    dataRoot,
    serverId: 'srv_inbox',
});

beforeEach(async () => {
    if (dataRoot) {
        await rm(dataRoot, { force: true, recursive: true });
    }
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-inbox-'));
});

test('mirrors the latest busy snapshot and removes next-run claims', async () => {
    const first = item('msg_first', '#general', 1);
    const second = item('msg_second', '#general', 2);

    await replacePendingInbox(location(), [first, second]);
    expect(await readPendingInbox(location())).toEqual([first, second]);

    await replacePendingInbox(location(), [second]);
    expect(await readPendingInbox(location())).toEqual([second]);

    await replacePendingInbox(location(), [first, second]);
    await acceptRunInbox(location(), 'run_next', [first]);
    expect(await readPendingInbox(location())).toEqual([second]);
});

test('dedupes and orders a replacement snapshot', async () => {
    const first = item('msg_first', '#general', 1);
    const second = item('msg_second', '#general', 2);
    await replacePendingInbox(location(), [second, first, second]);
    expect(await readPendingInbox(location())).toEqual([first, second]);
});

test('accepting a DM greeting removes its stale busy notice before the resumed turn', async () => {
    const greeting = item('msg_greeting', 'dm:@operator', 2);
    await replacePendingInbox(location(), [greeting]);
    await writePendingNotice(dataRoot, {
        agentId: location().agentId,
        notice: '[Haus inbox notice:\nInbox update: 1 unread message total; 1 changed target\ndm:@operator  pending: 1 message\n]',
        serverId: location().serverId,
    });

    await acceptRunInbox(location(), 'run_greeting', [greeting]);

    await expect(
        access(noticePath(dataRoot, { agentId: location().agentId, serverId: location().serverId }))
    ).rejects.toMatchObject({ code: 'ENOENT' });
});

test('consuming exact visible identities preserves unrelated pending work', async () => {
    const greeting = item('msg_greeting', 'dm:@operator', 2);
    const productTask = item('msg_product', '#product', 3);
    await replacePendingInbox(location(), [greeting, productTask]);

    await consumeVisibleMessages(location(), [greeting]);

    expect(await readPendingInbox(location())).toEqual([productTask]);
    expect(
        await Bun.file(
            noticePath(dataRoot, {
                agentId: location().agentId,
                serverId: location().serverId,
            })
        ).json()
    ).toMatchObject({ notice: expect.stringContaining('#product  pending: 1 message') });
});

test('does not resurrect a consumed identity from a stale notice snapshot', async () => {
    const greeting = item('msg_greeting', 'dm:@operator', 2);
    const productTask = item('msg_product', '#product', 3);

    await consumeVisibleMessages(location(), [greeting]);
    await replacePendingInbox(location(), [greeting, productTask]);

    expect(await readPendingInbox(location())).toEqual([productTask]);
});

test('retains a visible identity omitted from a bounded notice window', async () => {
    const firstWindow = Array.from({ length: 50 }, (_, index) =>
        item(`msg_${index + 1}`, '#product', index + 1)
    );
    const omitted = item('msg_51', '#product', 51);

    await consumeVisibleMessages(location(), [omitted]);
    await replacePendingInbox(location(), firstWindow, 51);
    await replacePendingInbox(location(), [omitted], 1);

    expect(await readPendingInbox(location())).toEqual([]);
});

test('re-exposes a locally pulled body and clears stale visibility before crash replay', async () => {
    const message = item('msg_replay', '#product', 1);
    await replacePendingInbox(location(), [message]);
    await recordRunVisibleMessages(location(), 'run_replay', [
        { chatId: message.chatId, id: message.id, sequence: message.sequence },
    ]);
    await consumeVisibleMessages(location(), [message]);
    expect(await readPendingInbox(location())).toEqual([]);

    await prepareRunReplay(location(), 'run_replay');
    await replacePendingInbox(location(), [message]);

    expect(await readPendingInbox(location())).toEqual([message]);
    expect(await readRunVisibleMessages(location(), 'run_replay')).toEqual([]);
});

test('re-exposes a consumed identity when Server offers it in a new turn', async () => {
    const message = item('msg_reoffered', '#product', 1);
    await replacePendingInbox(location(), [message]);
    await consumeVisibleMessages(location(), [message]);
    await replacePendingInbox(location(), [message]);
    expect(await readPendingInbox(location())).toEqual([]);

    await reofferPendingMessages(location(), [message]);
    await replacePendingInbox(location(), [message]);

    expect(await readPendingInbox(location())).toEqual([message]);
});

test('does not hold the inbox lock while live notice delivery waits', async () => {
    const greeting = item('msg_greeting', 'dm:@operator', 2);
    let releaseDelivery: (() => void) | undefined;
    const deliveryStarted = Promise.withResolvers<void>();
    const deliveryReleased = new Promise<void>((resolve) => {
        releaseDelivery = resolve;
    });
    const delivered: string[] = [];

    const replacement = replacePendingInbox(location(), [greeting], 1, async (notice) => {
        delivered.push(notice);
        deliveryStarted.resolve();
        await deliveryReleased;
    });
    await deliveryStarted.promise;
    const acceptance = acceptRunInbox(location(), 'run_greeting', [greeting]);

    await acceptance;
    expect(await readPendingInbox(location())).toEqual([]);
    releaseDelivery?.();
    await replacement;

    expect(delivered).toHaveLength(1);
    expect(await readPendingInbox(location())).toEqual([]);
    await expect(
        access(noticePath(dataRoot, { agentId: location().agentId, serverId: location().serverId }))
    ).rejects.toMatchObject({ code: 'ENOENT' });
});

test('retires a served fire from the mirror and its busy notice', async () => {
    const fire = automationItem('trf_41c2d8e9', 'trigger', 'trigger');
    const message = item('msg_after', '#general', 2);
    await replacePendingInbox(location(), [fire, message]);
    expect(await readPendingInbox(location())).toEqual([fire, message]);

    await consumeServedAutomations(location(), [fire.id]);

    expect(await readPendingInbox(location())).toEqual([message]);
    // The retired fire never returns, even when the Server re-mirrors it.
    await replacePendingInbox(location(), [fire, message], 2);
    expect(await readPendingInbox(location())).toEqual([message]);
});

test('names bodiless frames apart from ordinary and typed system inbox rows', () => {
    expect(isAutomationInboxItem(automationItem('trf_41c2d8e9', 'trigger', 'trigger'))).toBe(true);
    expect(isAutomationInboxItem(automationItem('rmf_9a8b7c6d', 'reminder', 'system'))).toBe(true);
    expect(
        isAutomationInboxItem(automationItem('task-assign:msg_1a2b3c4d:3', 'haus', 'system'))
    ).toBe(true);
    // A saved pre-migration assignment still has to be consumed as an automation.
    expect(
        isAutomationInboxItem(automationItem('task-assign:msg_1a2b3c4d:3', 'haus', 'system'))
    ).toBe(true);
    expect(isAutomationInboxItem(item('msg_plain', '#general', 1))).toBe(false);
    expect(
        isAutomationInboxItem({
            ...automationItem('cap_greeting', 'onboarding', 'system'),
        })
    ).toBe(false);
});

function automationItem(
    id: string,
    senderHandle: string,
    senderType: AgentInboxItem['senderType']
): AgentInboxItem {
    return {
        chatId: 'cht_inbox',
        content: `fire ${id}`,
        createdAt: new Date(Date.UTC(2026, 6, 27, 0, 0, 1)).toISOString(),
        id,
        senderHandle,
        senderType,
        sequence: 1,
        target: '#general',
    };
}

function item(id: string, target: string, sequence: number): AgentInboxItem {
    return {
        chatId: 'cht_inbox',
        content: `message ${sequence}`,
        createdAt: new Date(Date.UTC(2026, 6, 27, 0, 0, sequence)).toISOString(),
        id,
        senderHandle: 'operator',
        senderType: 'human',
        sequence,
        target,
    };
}
