import { afterEach, describe, expect, test } from 'bun:test';
import type { TranscriptContext } from '@earendil-works/pi-ai';
import { fauxAssistantMessage, fauxText } from '@earendil-works/pi-ai/providers/faux';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';
import { agentDir, collect, fauxHarness, launch, roles } from './pi-faux-run.ts';

afterEach(drainCleanups);

describe('Pi Durable session resume', () => {
    test('a session resumes warm, then cold from its SQLite store after a restart', async () => {
        const { run, server } = await startedRun();
        const dir = await agentDir();
        const first = fauxHarness([
            fauxAssistantMessage([fauxText('One.')]),
            (context) => fauxAssistantMessage([fauxText(`Warm: ${roles(context).join(',')}`)]),
        ]);
        const opened = await first
            .factory(launch(dir, run.tools))
            .openSession({ resumeFrom: undefined, sessionId: 'agt_1-1' });
        await collect((await opened.startTurn({ prompt: 'First.', signal: live() })).events);
        const sessionId = await opened.detach();

        const warm = await first
            .factory(launch(dir, run.tools))
            .openSession({ resumeFrom: sessionId, sessionId: 'agt_1-1' });
        const warmTurn = await collect(
            (await warm.startTurn({ prompt: 'Second.', signal: live() })).events
        );
        await warm.detach();
        await first.close();

        const restarted = fauxHarness([
            (context) => fauxAssistantMessage([fauxText(`Cold: ${roles(context).join(',')}`)]),
        ]);
        const cold = await restarted
            .factory(launch(dir, run.tools))
            .openSession({ resumeFrom: sessionId, sessionId: 'agt_1-1' });
        const coldTurn = await collect(
            (await cold.startTurn({ prompt: 'Third.', signal: live() })).events
        );

        expect(warm.isResume).toBe(true);
        expect(warmTurn.text).toBe('Warm: system,user,assistant,user');
        expect(cold.isResume).toBe(true);
        expect(cold.sessionId).toBe(sessionId);
        expect(coldTurn.text).toBe('Cold: system,user,assistant,user,assistant,user');
        expect(server.requests).toEqual([]);
    });

    test('a changed prompt reaches a resumed session as a system update in place', async () => {
        const { run } = await startedRun();
        const dir = await agentDir();
        const seen: TranscriptContext[] = [];
        const harness = fauxHarness([
            fauxAssistantMessage([fauxText('One.')]),
            (context) => {
                seen.push(context);
                return fauxAssistantMessage([fauxText('Two.')]);
            },
        ]);
        const first = await harness
            .factory(launch(dir, run.tools))
            .openSession({ resumeFrom: undefined, sessionId: 'agt_1-1' });
        await collect((await first.startTurn({ prompt: 'First.', signal: live() })).events);
        const sessionId = await first.detach();

        const updated = { ...launch(dir, run.tools), instructions: 'You are Blippy, renamed.\n' };
        const resumed = await harness
            .factory(updated)
            .openSession({ resumeFrom: sessionId, sessionId: 'agt_1-1' });
        await collect((await resumed.startTurn({ prompt: 'Second.', signal: live() })).events);

        expect(
            seen[0]?.messages.flatMap((message) =>
                message.role === 'system' ? [message.sections] : []
            )
        ).toEqual([
            { haus: 'You are Blippy, a Haus Agent.\n' },
            { haus: 'You are Blippy, renamed.\n' },
        ]);
    });
});
