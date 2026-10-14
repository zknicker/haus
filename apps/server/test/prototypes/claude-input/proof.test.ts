import { expect, test } from 'bun:test';
import { startFixture } from './haus-fixture.ts';
import { RequestStore } from './request-store.ts';

test('question survives Server restart, one real inbox delivery, delayed answer and exact consumption', async () => {
    const fixture = await startFixture();
    try {
        const store = new RequestStore(fixture.harness.sql);
        await store.initialize();
        const input = {
            sessionId: '00000000-0000-4000-8000-000000000001',
            promptId: 'original-prompt',
            toolUseId: 'original-tool',
            questions: [
                {
                    header: 'Route',
                    multiSelect: false,
                    question: 'Which route?',
                    options: [
                        { label: 'alpha', description: 'First' },
                        { label: 'beta', description: 'Second' },
                    ],
                },
            ],
        };
        const request = await store.register(input);
        expect((await store.register(input)).id).toBe(request.id);
        await fixture.notify(request.id, request);
        await fixture.notify(request.id, request);
        await fixture.harness.restart();
        expect((await store.read(request.id)).state).toBe('pending');
        const [count] = await fixture.harness
            .sql`select count(*)::int as n from agent_inbox where agent_id=${fixture.agentId}`;
        expect(count.n).toBe(1);
        await fixture.attach();
        const deadline = Date.now() + 5000;
        while (!fixture.frames.some((frame) => frame.type === 'start') && Date.now() < deadline) {
            await Bun.sleep(20);
        }
        const start = fixture.frames.find((frame) => frame.type === 'start');
        expect(start).toMatchObject({ agentId: fixture.agentId, inboxDelivery: 'concrete' });
        expect(JSON.stringify(start?.inbox)).toContain(request.id);
        const token = await fixture.mint(String(start?.runId));
        expect(await fixture.authorize(token)).toBe(true);
        expect(await fixture.authorize('wrong')).toBe(false);
        await expect(store.read(request.id, 'session_other')).rejects.toThrow();
        await expect(
            store.register({
                ...input,
                questions: [{ ...input.questions[0]!, question: 'Changed?' }],
            })
        ).rejects.toThrow();
        const answer = { 'Which route?': 'alpha' };
        expect((await store.answer(request.id, answer)).state).toBe('answered');
        expect((await store.answer(request.id, answer)).state).toBe('answered');
        await expect(store.answer(request.id, { 'Which route?': 'beta' })).rejects.toThrow();
        await fixture.harness.restart();
        expect((await store.read(request.id)).state).toBe('answered');
        const receipt = {
            sessionId: input.sessionId,
            promptId: 'resumed-prompt',
            toolUseId: 'resumed-tool',
            answer,
        };
        await expect(
            store.resolve(request.id, { ...receipt, answer: { 'Which route?': 'beta' } })
        ).rejects.toThrow();
        expect((await store.resolve(request.id, receipt)).state).toBe('resolved');
        expect((await store.resolve(request.id, receipt)).state).toBe('resolved');
        await expect(
            store.resolve(request.id, { ...receipt, toolUseId: 'conflict' })
        ).rejects.toThrow();
        const cancelled = await store.register({ ...input, toolUseId: 'cancel-tool' });
        await store.cancel(cancelled.id);
        await expect(store.answer(cancelled.id, answer)).rejects.toThrow();
        await expect(store.resolve(cancelled.id, receipt)).rejects.toThrow();
    } finally {
        await fixture.close();
    }
}, 30_000);
