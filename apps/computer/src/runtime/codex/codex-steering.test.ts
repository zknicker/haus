// Ported from botiverse/raft-source packages/daemon/src/drivers/codex.test.ts (FSL-1.1-ALv2)
import { describe, expect, test } from 'bun:test';
import { FakeAppServer } from './testing/fake-app-server.ts';
import {
    emitTurn,
    flush,
    labels,
    openFake,
    startFakeTurn,
    turnCompleted,
    turnStarted,
    usage,
} from './testing/session-harness.ts';

const command = (id: string) => ({
    item: { command: 'ls', commandActions: [], cwd: '/w', id, type: 'commandExecution' },
});

describe('Codex steering and Stop', () => {
    test('a steer with no running turn is idle', async () => {
        const { session } = await openFake();
        expect(await session.steer('hello')).toEqual({ delivered: false, reason: 'idle' });
    });

    test('a busy steer is turn/steer with the expected turn id', async () => {
        const { fake, session } = await openFake();
        const turn = await startFakeTurn(fake, session);
        turnStarted(fake, turn.turnId);
        await flush();
        expect(await session.steer('steer')).toEqual({ delivered: true });
        expect(fake.request('turn/steer')?.params).toEqual({
            expectedTurnId: turn.turnId,
            input: [{ text: 'steer', text_elements: [], type: 'text' }],
            threadId: 'thread-1',
        });
    });

    test('an accepted turn is not steerable until turn/started', async () => {
        const { fake, session } = await openFake();
        const turn = await startFakeTurn(fake, session);
        const steer = session.steer('too early');
        await flush();
        expect(fake.methods()).not.toContain('turn/steer');
        turnStarted(fake, turn.turnId);
        expect(await steer).toEqual({ delivered: true });
        expect(fake.request('turn/steer')?.params.expectedTurnId).toBe(turn.turnId);
    });

    test('the steering gate holds a steer right after a tool finishes (regression #238)', async () => {
        const { fake, session } = await openFake();
        const turn = await startFakeTurn(fake, session);
        turnStarted(fake, turn.turnId);
        emitTurn(fake, turn.turnId, 'item/started', command('tool-1'));
        emitTurn(fake, turn.turnId, 'item/completed', command('tool-1'));
        await flush();
        const steer = session.steer('urgent');
        await flush();
        expect(fake.methods()).not.toContain('turn/steer');
        emitTurn(fake, turn.turnId, 'item/reasoning/textDelta', {
            delta: 'thinking...',
            itemId: 'r-1',
        });
        expect(await steer).toEqual({ delivered: true });
    });

    test('a completed agent message without deltas reopens the gate', async () => {
        const { fake, session } = await openFake();
        const turn = await startFakeTurn(fake, session);
        turnStarted(fake, turn.turnId);
        emitTurn(fake, turn.turnId, 'item/completed', command('tool-1'));
        await flush();
        const steer = session.steer('steer');
        emitTurn(fake, turn.turnId, 'item/completed', {
            item: { id: 'm-1', phase: null, text: 'Fallback text', type: 'agentMessage' },
        });
        expect(await steer).toEqual({ delivered: true });
    });

    test('a steer whose turn ends first is idle, so the notice waits for the next turn', async () => {
        const { fake, session } = await openFake();
        const turn = await startFakeTurn(fake, session);
        turnStarted(fake, turn.turnId);
        emitTurn(fake, turn.turnId, 'item/completed', command('tool-1'));
        await flush();
        const steer = session.steer('late');
        turnCompleted(fake, turn.turnId);
        expect(await steer).toEqual({ delivered: false, reason: 'idle' });
    });

    test('a rejected busy steer is a failed delivery', async () => {
        const fake = new FakeAppServer({
            'turn/steer': () => ({ error: { message: 'steer rejected by app-server' } }),
        });
        const { session } = await openFake(fake);
        const turn = await startFakeTurn(fake, session);
        turnStarted(fake, turn.turnId);
        await flush();
        const result = await session.steer('busy follow-up');
        expect(result).toMatchObject({ delivered: false, reason: 'failed' });
    });

    test('Stop interrupts the accepted turn and settles at turn/completed', async () => {
        const { fake, session } = await openFake();
        const turn = await startFakeTurn(fake, session);
        turnStarted(fake, turn.turnId);
        usage(fake, turn.turnId);
        await flush();
        turn.abort.abort();
        await flush();
        expect(fake.request('turn/interrupt')?.params).toEqual({
            threadId: 'thread-1',
            turnId: turn.turnId,
        });
        let settled = false;
        void turn.settle().then(() => {
            settled = true;
        });
        await flush();
        expect(settled).toBe(false);
        turnCompleted(fake, turn.turnId, 'interrupted');
        await turn.settle();
        expect(labels(await turn.finished)).toEqual(['step-finish', 'turn-finish', 'abort']);
    });

    test('Stop before Codex names the turn interrupts once the id arrives', async () => {
        const fake = new FakeAppServer({ 'turn/start': () => 'hold' });
        const { session } = await openFake(fake);
        const abort = new AbortController();
        const starting = session.startTurn({ prompt: 'go', signal: abort.signal });
        await flush();
        abort.abort();
        fake.reply('turn/start', { result: { turn: { id: 'turn-9' } } });
        await starting;
        await flush();
        expect(fake.request('turn/interrupt')?.params).toEqual({
            threadId: 'thread-1',
            turnId: 'turn-9',
        });
    });

    test('an app-server crash fails the running turn and later turns', async () => {
        const { fake, session } = await openFake();
        const turn = await startFakeTurn(fake, session);
        turnStarted(fake, turn.turnId);
        fake.crash(137);
        const events = await turn.finished;
        expect(labels(events).at(-1)).toMatch(
            /^error:The Codex app-server exited \(exit code 137\)/u
        );
        await turn.settle();
        expect(session.alive).toBe(false);
        expect(await session.steer('x')).toEqual({ delivered: false, reason: 'idle' });
        await expect(
            session.startTurn({ prompt: 'again', signal: new AbortController().signal })
        ).rejects.toThrow(/app-server exited/u);
    });

    test('unsupported server requests are refused; approvals follow full access', async () => {
        const { fake } = await openFake();
        fake.emit({
            id: 'srv-1',
            method: 'item/tool/requestUserInput',
            params: { prompt: 'Need input' },
        });
        fake.emit({ id: 'srv-2', method: 'item/commandExecution/requestApproval', params: {} });
        fake.emit({ id: 'srv-3', method: 'applyPatchApproval', params: {} });
        fake.emit({
            id: 'srv-4',
            method: 'item/permissions/requestApproval',
            params: { permissions: { fileSystem: { write: ['/x'] }, network: null } },
        });
        await flush();
        const reply = (id: string) => fake.replies.find((message) => message.id === id);
        expect(reply('srv-1')).toMatchObject({ error: { code: -32_601 } });
        expect(String((reply('srv-1')?.error as { message: string }).message)).toContain(
            'item/tool/requestUserInput'
        );
        expect(reply('srv-2')?.result).toEqual({ decision: 'accept' });
        expect(reply('srv-3')?.result).toEqual({ decision: 'approved' });
        expect(reply('srv-4')?.result).toEqual({
            permissions: { fileSystem: { write: ['/x'] } },
            scope: 'session',
        });
    });

    test('a server request reusing a client request id is not taken for its response', async () => {
        const fake = new FakeAppServer({ 'turn/start': () => 'hold' });
        const { session } = await openFake(fake);
        const starting = session.startTurn({ prompt: 'go', signal: new AbortController().signal });
        await flush();
        const id = fake.request('turn/start')?.id;
        fake.emit({ id, method: 'item/permissions/requestApproval', params: { permissions: {} } });
        await flush();
        fake.reply('turn/start', { result: { turn: { id: 'turn-1' } } });
        await starting;
        expect(fake.replies.find((message) => message.id === id)?.result).toMatchObject({
            scope: 'session',
        });
    });
});
