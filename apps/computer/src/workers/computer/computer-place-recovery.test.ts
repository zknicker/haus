import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FakeTurnContext } from '../../runtime/testing/fake-runtime-driver.ts';
import type { TurnEvent } from '../../runtime/turn-event.ts';
import {
    branch,
    computerStart,
    registerComputerPlaces,
    turnToken,
} from './computer-place.fixture.ts';
import type { WorkerHarnessLaunch } from './harness.ts';
import { sharedOf } from './turn-finish.ts';
import { ComputerTurnJournal, type ComputerTurnRef } from './turn-journal.ts';

const computerPlaces = registerComputerPlaces();
const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(['git', ...args], { cwd })
        .stdout.toString()
        .trim();

async function journalUpTo(
    journal: ComputerTurnJournal,
    frame: ReturnType<typeof computerStart>,
    phases: readonly ('credentialed' | 'running')[]
) {
    const ref: ComputerTurnRef = { turnId: frame.turnId, workerId: frame.workerId };
    await journal.accept(frame);
    for (const phase of phases) {
        await journal.advance(ref, (turn) => ({
            ...sharedOf(turn),
            frame,
            phase,
            token: turnToken,
        }));
    }
    return ref;
}

describe('a Computer that restarts', () => {
    test('ends each turn it left mid-launch without running it again, then reports what it holds', async () => {
        const computer = computerPlaces();
        const journal = new ComputerTurnJournal(join(computer.root, 'data'), 'srv_1');
        const running = computerStart({ turnId: 'wkt_b', workerId: 'wrk_b' });
        await journalUpTo(journal, computerStart({ turnId: 'wkt_a', workerId: 'wrk_a' }), [
            'credentialed',
        ]);
        await journalUpTo(journal, running, ['credentialed', 'running']);
        const { fake, frames, place } = computer.place();
        await place.connected();
        await place.accept(running);

        expect(frames).toEqual([
            {
                attempt: 1,
                branch,
                branches: [],
                detail: 'The Computer restarted before the harness started.',
                exit: 'crashed-before-launch',
                sessionId: null,
                turnId: 'wkt_a',
                type: 'worker-turn-ended',
            },
            {
                attempt: 1,
                branch,
                branches: [],
                detail: 'The Computer lost the harness process.',
                exit: 'uncertain',
                sessionId: null,
                turnId: 'wkt_b',
                type: 'worker-turn-ended',
            },
            { type: 'worker-held', workerIds: ['wrk_a', 'wrk_b'] },
            { attempt: 1, turnId: 'wkt_b', type: 'worker-turn-accepted' },
            expect.objectContaining({ exit: 'uncertain', turnId: 'wkt_b' }),
        ]);
        expect(fake.record.launches).toEqual([]);
    });

    test('a turn left mid-push finishes its push under the turn id, then ends', async () => {
        const computer = computerPlaces();
        const journal = new ComputerTurnJournal(join(computer.root, 'data'), 'srv_1');
        const ref = await journalUpTo(journal, computerStart(), ['credentialed', 'running']);
        await journal.advance(ref, (turn) => ({
            ...sharedOf(turn),
            ending: { branch, branches: [], detail: null, exit: 'exited' },
            phase: 'pushing',
        }));
        const area = join(journal.layout('wrk_1').drive, 'agents', 'alpha');
        await mkdir(area, { recursive: true });
        await writeFile(join(area, 'notes.md'), 'Left by the turn.');
        const { frames, place } = computer.place();
        await place.connected();

        expect(computer.drive.text('agents/alpha/notes.md')).toBe('Left by the turn.');
        expect(computer.mints).toEqual(['push-credential wkt_1']);
        expect(frames[0]).toMatchObject({
            exit: 'exited',
            turnId: 'wkt_1',
            type: 'worker-turn-ended',
        });
    });
});

describe('a drive push that fails', () => {
    test('keeps the turn pushing with no end, and the next connect pushes, ends, then closes', async () => {
        const computer = computerPlaces();
        computer.drive.loseNextAnswers(1);
        const { frames, place, sent } = computer.place({
            sessionId: 'thread-9',
            turn: writeThenWait,
        });
        await place.accept(computerStart());
        await sent('worker-turn-input-accepted');
        await place.close('wrk_1');

        expect(frames.map((frame) => frame.type)).toEqual([
            'worker-turn-accepted',
            'worker-turn-session',
            'worker-turn-input-accepted',
        ]);
        expect((await place.journal.turn({ turnId: 'wkt_1', workerId: 'wrk_1' }))?.phase).toBe(
            'pushing'
        );
        expect(existsSync(join(place.journal.layout('wrk_1').drive, 'agents', 'alpha'))).toBe(true);

        await place.connected();

        expect(computer.drive.text('agents/alpha/notes.md')).toBe('Written before the stop.');
        expect(frames.slice(3)).toEqual([
            {
                attempt: 1,
                branch,
                branches: [],
                detail: null,
                exit: 'stopped',
                sessionId: 'thread-9',
                turnId: 'wkt_1',
                type: 'worker-turn-ended',
            },
            { type: 'worker-held', workerIds: ['wrk_1'] },
        ]);
        await place.close('wrk_1');
        expect(existsSync(place.journal.layout('wrk_1').root)).toBe(false);
    });
});

describe('closing a Worker', () => {
    test('removes its worktree and folder, twice over, and keeps its branch', async () => {
        const computer = computerPlaces();
        const { frames, place, sent } = computer.place();
        await place.accept(computerStart());
        await sent('worker-turn-ended');
        await place.close('wrk_1');
        await place.close('wrk_1');
        await place.connected();

        const clone = join(computer.root, 'data', 'repos', 'acme', 'app');
        expect(existsSync(place.journal.layout('wrk_1').root)).toBe(false);
        expect(git(clone, 'worktree', 'list').split('\n')).toHaveLength(1);
        expect(git(clone, 'branch', '--list', branch)).toBe(branch);
        expect(frames.at(-1)).toEqual({ type: 'worker-held', workerIds: [] });
    });
});

async function* writeThenWait(context: FakeTurnContext<WorkerHarnessLaunch>) {
    const [drive] = context.input.writableRoots;
    await mkdir(join(drive ?? '', 'agents', 'alpha'), { recursive: true });
    await writeFile(join(drive ?? '', 'agents', 'alpha', 'notes.md'), 'Written before the stop.');
    yield { nativeType: 'turn/started', type: 'progress' } satisfies TurnEvent;
    if (!context.signal.aborted) {
        await new Promise((resolve) =>
            context.signal.addEventListener('abort', resolve, { once: true })
        );
    }
    yield { type: 'abort' } satisfies TurnEvent;
}
