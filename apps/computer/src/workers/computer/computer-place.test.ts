import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    repoClonesFrameSchema,
    workerHeldFrameSchema,
    workerTurnAcceptedFrameSchema,
    workerTurnActivityFrameSchema,
    workerTurnEndedFrameSchema,
    workerTurnInputAcceptedFrameSchema,
    workerTurnQuestionFrameSchema,
    workerTurnSessionFrameSchema,
    workerTurnStepsFrameSchema,
} from '@haus/api';
import type { FakeTurnContext } from '../../runtime/testing/fake-runtime-driver.ts';
import { finishedTurn } from '../../runtime/testing/fake-runtime-driver.ts';
import type { TurnEvent } from '../../runtime/turn-event.ts';
import {
    branch,
    computerStart,
    pushToken,
    registerComputerPlaces,
    turnToken,
} from './computer-place.fixture.ts';
import type { WorkerHarnessLaunch } from './harness.ts';

const computerPlaces = registerComputerPlaces();
const wireSchemas = {
    'repo-clones': repoClonesFrameSchema,
    'worker-held': workerHeldFrameSchema,
    'worker-turn-accepted': workerTurnAcceptedFrameSchema,
    'worker-turn-activity': workerTurnActivityFrameSchema,
    'worker-turn-ended': workerTurnEndedFrameSchema,
    'worker-turn-input-accepted': workerTurnInputAcceptedFrameSchema,
    'worker-turn-question': workerTurnQuestionFrameSchema,
    'worker-turn-session': workerTurnSessionFrameSchema,
    'worker-turn-steps': workerTurnStepsFrameSchema,
};
const ref = { turnId: 'wkt_1', workerId: 'wrk_1' };
const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(['git', ...args], { cwd })
        .stdout.toString()
        .trim();

describe('a Worker turn on a Computer', () => {
    test('runs in its worktree, pulls and pushes its drive folder, and ends after the push', async () => {
        const computer = computerPlaces();
        computer.drive.write('haus/AGENTS.md', 'House rules', 'agt_beta');
        const seen: Record<string, string> = {};
        const { fake, frames, place, sent } = computer.place({
            sessionId: 'thread-9',
            turn: (context) => deliver(context, seen),
        });
        await place.accept(computerStart());
        await sent('worker-turn-ended');

        expect(frames).toEqual([
            { attempt: 1, turnId: 'wkt_1', type: 'worker-turn-accepted' },
            {
                clones: [
                    {
                        path: join(
                            computer.root,
                            'data',
                            'servers',
                            'srv_1',
                            'repos',
                            'acme',
                            'app'
                        ),
                        repository: 'acme/app',
                    },
                ],
                type: 'repo-clones',
            },
            { sessionId: 'thread-9', turnId: 'wkt_1', type: 'worker-turn-session' },
            {
                attempt: 1,
                turnId: 'wkt_1',
                type: 'worker-turn-input-accepted',
                workerMdRevisionId: 'rev_md_1',
            },
            {
                at: '1970-01-01T00:00:05.000Z',
                summary: 'Running git status',
                turnId: 'wkt_1',
                type: 'worker-turn-activity',
            },
            {
                attempt: 1,
                steps: [
                    {
                        additions: null,
                        deletions: null,
                        kind: 'run',
                        label: 'git status',
                        output: null,
                        state: 'running',
                    },
                ],
                turnId: 'wkt_1',
                type: 'worker-turn-steps',
            },
            {
                attempt: 1,
                branch,
                branches: [
                    {
                        branch,
                        pullRequest: null,
                        pullRequestUrl: 'https://github.com/acme/app/pull/7',
                        repository: 'acme/app',
                    },
                ],
                detail: null,
                exit: 'exited',
                sessionId: 'thread-9',
                turnId: 'wkt_1',
                type: 'worker-turn-ended',
            },
        ]);
        expect(frames.map((frame) => wireSchemas[frame.type].parse(frame))).toEqual(frames);
        expect(seen).toEqual({ branch, rules: 'House rules' });
        expect(computer.drive.text('agents/alpha/reports/SEC-12/summary.md')).toBe('Done.');
        expect(computer.mints).toEqual(['turn-credential wkt_1', 'push-credential wkt_1']);
        const [launch] = fake.record.launches;
        expect(launch?.input.env.HAUS_WORKER_TOKEN).toBe(turnToken);
        expect(Object.values(launch?.input.env ?? {})).not.toContain(pushToken);
        expect(launch?.input.env.PATH.split(':')[0]).toEndWith('/workers/wrk_1/runtime/bin');
        expect(fake.record.prompts).toEqual(['Write the report.']);
        expect(fake.record.opens).toEqual([{ resumeFrom: undefined, sessionId: 'wrk_1' }]);
    });

    test('the harness temp folder is the Worker runtime/tmp, and it is a writable root', async () => {
        const computer = computerPlaces();
        const { fake, place, sent } = computer.place();
        await place.accept(computerStart());
        await sent('worker-turn-ended');

        const workerRoot = join(computer.root, 'data', 'servers', 'srv_1', 'workers', 'wrk_1');
        const tmp = join(workerRoot, 'runtime', 'tmp');
        const [launch] = fake.record.launches;
        expect([launch?.input.env.TMPDIR, launch?.input.env.TMP, launch?.input.env.TEMP]).toEqual([
            tmp,
            tmp,
            tmp,
        ]);
        expect(launch?.input.writableRoots.slice(0, 3)).toEqual([
            join(workerRoot, 'drive'),
            join(workerRoot, 'runtime', 'report'),
            tmp,
        ]);
        expect((await stat(tmp)).isDirectory()).toBe(true);
    });

    test('a later turn resumes the native session it was given', async () => {
        const { fake, place, sent } = computerPlaces().place();
        await place.accept(computerStart({ resumeSessionId: 'thread-9', runtime: 'claude-code' }));
        await sent('worker-turn-ended');
        expect(fake.record.opens).toEqual([
            {
                resumeFrom: { claudeSessionId: 'thread-9', runtime: 'claude-code', version: 1 },
                sessionId: 'wrk_1',
            },
        ]);
    });

    test('a refused credential ends the turn refused and never launches it', async () => {
        const computer = computerPlaces({ refuse: 'stale-attempt' });
        const { fake, frames, place, sent } = computer.place();
        await place.accept(computerStart());
        await sent('worker-turn-ended');

        expect(frames.at(-1)).toEqual({
            attempt: 1,
            branch,
            branches: [],
            detail: 'stale-attempt',
            exit: 'refused',
            sessionId: null,
            turnId: 'wkt_1',
            type: 'worker-turn-ended',
        });
        expect(fake.record.launches).toEqual([]);
    });

    test('Claude Code input counts as accepted on its first event, Codex on turn start', async () => {
        const computer = computerPlaces();
        const claude = computer.place({ turn: () => [] });
        await claude.place.accept(computerStart({ runtime: 'claude-code' }));
        await claude.sent('worker-turn-ended');
        const codex = computer.place({ turn: () => [] });
        await codex.place.accept(
            computerStart({
                checkout: {
                    branch: 'haus/wrk_2/sec-12',
                    checkoutPath: null,
                    repository: 'acme/app',
                    startingRef: null,
                },
                turnId: 'wkt_2',
                workerId: 'wrk_2',
            })
        );
        await codex.sent('worker-turn-ended');

        expect(claude.frames.map((frame) => frame.type)).toEqual([
            'worker-turn-accepted',
            'repo-clones',
            'worker-turn-session',
            'worker-turn-ended',
        ]);
        expect(codex.frames.map((frame) => frame.type)).toEqual([
            'worker-turn-accepted',
            'worker-turn-session',
            'worker-turn-input-accepted',
            'worker-turn-ended',
        ]);
    });

    test('a start resent while a turn runs answers with the running attempt and never runs it twice', async () => {
        const { fake, frames, place, sent } = computerPlaces().place({ turn: untilStopped });
        await place.accept(computerStart());
        await sent('worker-turn-input-accepted');
        await place.accept(computerStart({ attempt: 2 }));
        await place.stop(ref);

        expect(
            frames.flatMap((frame) =>
                'attempt' in frame ? [`${frame.type} ${frame.attempt}`] : []
            )
        ).toEqual([
            'worker-turn-accepted 1',
            'worker-turn-input-accepted 1',
            'worker-turn-accepted 1',
            'worker-turn-ended 1',
        ]);
        expect(fake.record.launches).toHaveLength(1);
    });

    test('a stop ends the harness, pushes, and settles the turn stopped', async () => {
        const { fake, frames, place, sent } = computerPlaces().place({ turn: untilStopped });
        await place.accept(computerStart());
        await sent('worker-turn-input-accepted');
        await place.stop(ref);

        expect(frames.at(-1)).toMatchObject({ exit: 'stopped', type: 'worker-turn-ended' });
        expect(fake.record.counts.destroy).toBe(1);
        expect((await place.journal.turn(ref))?.stopRequested).toBe(true);
    });
});

async function* deliver(
    context: FakeTurnContext<WorkerHarnessLaunch>,
    seen: Record<string, string>
) {
    const [drive, report] = context.input.writableRoots;
    seen.branch = git(context.input.cwd, 'branch', '--show-current');
    seen.rules = await readFile(join(drive ?? '', 'haus', 'AGENTS.md'), 'utf8');
    await mkdir(join(drive ?? '', 'agents', 'alpha', 'reports', 'SEC-12'), { recursive: true });
    await writeFile(
        join(drive ?? '', 'agents', 'alpha', 'reports', 'SEC-12', 'summary.md'),
        'Done.'
    );
    await writeFile(
        join(report ?? '', 'receipt.json'),
        JSON.stringify({
            draft: {
                ask: null,
                outcome: 'done',
                personId: null,
                pullRequestUrls: ['https://github.com/acme/app/pull/7'],
                text: 'Done.',
            },
            turnId: 'wkt_1',
        })
    );
    yield {
        input: { command: 'git status' },
        providerExecuted: true,
        toolCallId: 'call_1',
        toolName: 'bash',
        type: 'tool-call',
    } satisfies TurnEvent;
    yield* finishedTurn();
}

async function* untilStopped(context: FakeTurnContext<WorkerHarnessLaunch>) {
    yield { nativeType: 'turn/started', type: 'progress' } satisfies TurnEvent;
    await new Promise((resolve) =>
        context.signal.addEventListener('abort', resolve, { once: true })
    );
    yield { type: 'abort' } satisfies TurnEvent;
}
