import { afterEach } from 'bun:test';
import { mkdtempSync, realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    type WorkerTurnCredentialResponse,
    type WorkerTurnStartFrame,
    workerPushCredentialRequestSchema,
    workerTurnCredentialRequestSchema,
} from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import { type DriveServer, startDriveServer } from '../../drive/drive-server.fixture.ts';
import {
    type FakeRuntimeScript,
    fakeRuntimeDriver,
} from '../../runtime/testing/fake-runtime-driver.ts';
import { createPullRequestReader } from '../github/pull-request-reader.ts';
import { ComputerWorkerPlace } from './computer-place.ts';
import type { WorkerHarnessLaunch } from './harness.ts';
import type { Schedule } from './push-retry.ts';
import type { ComputerPlaceFrame } from './turn-finish.ts';

export const agentId = 'agt_alpha';
export const turnToken = `hwt_${'t'.repeat(43)}`;
export const pushToken = `hwp_${'p'.repeat(43)}`;
export const branch = 'haus/sec-12-wrk_1';

type Refusal = Extract<WorkerTurnCredentialResponse, { state: 'refused' }>['reason'];

export function registerComputerPlaces() {
    const cleanup: Array<() => Promise<void>> = [];
    afterEach(async () => {
        for (const close of cleanup.splice(0).reverse()) {
            await close();
        }
    });
    return (options: { refuse?: Refusal } = {}) => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), 'haus-computer-place-')));
        const mints: string[] = [];
        const drive: DriveServer = startDriveServer({
            route: (request, url) => mintRoute(request, url, mints, options.refuse),
            writer: (token) => (token === pushToken ? agentId : token),
        });
        const runtime = makeTestRuntime();
        cleanup.push(async () => {
            drive.stop();
            await runtime.dispose();
            Bun.spawnSync(['chmod', '-R', 'u+w', root]);
            await rm(root, { force: true, recursive: true });
        });
        seedRemote(root);
        return {
            drive,
            mints,
            root,
            place: (script: FakeRuntimeScript<WorkerHarnessLaunch> = {}, schedule?: Schedule) => {
                const fake = fakeRuntimeDriver<WorkerHarnessLaunch>(script);
                const frames: ComputerPlaceFrame[] = [];
                let clock = 0;
                const place = new ComputerWorkerPlace({
                    dataRoot: join(root, 'data'),
                    driver: (launch) => fake.factory(launch, { env: launch.env, instructions: '' }),
                    now: () => {
                        clock += 5000;
                        return clock;
                    },
                    reader: createPullRequestReader({
                        fetch: (target, init) =>
                            fetch(target.replace('https://api.github.com', drive.origin), init),
                        runtime,
                        token: async () => null,
                    }),
                    repos: {
                        remoteUrl: (repository) => join(root, 'remotes', `${repository}.git`),
                    },
                    schedule,
                    server: { credential: 'computer-credential', serverOrigin: drive.origin },
                    serverId: 'srv_1',
                });
                const waiting: Array<{ resolve: () => void; type: string }> = [];
                place.attach((frame) => {
                    frames.push(frame);
                    for (const waiter of waiting.filter((entry) => entry.type === frame.type)) {
                        waiter.resolve();
                    }
                });
                const sent = (type: ComputerPlaceFrame['type']) =>
                    frames.some((frame) => frame.type === type)
                        ? Promise.resolve()
                        : new Promise<void>((resolve) => waiting.push({ resolve, type }));
                cleanup.push(() => place.shutdown());
                return { fake, frames, place, sent };
            },
        };
    };
}

export function computerStart(overrides: Partial<WorkerTurnStartFrame> = {}) {
    return {
        agentId,
        attempt: 1,
        checkout: { branch, checkoutPath: null, repository: 'acme/app', startingRef: null },
        input: 'Write the report.',
        model: { droppedParams: [], fallbackFrom: null, id: null, params: [] },
        place: { computerId: 'cmp_1234567890abcdef', kind: 'computer' },
        predecessorTurnIds: [],
        providerAgentId: null,
        repository: 'acme/app',
        resumeSessionId: null,
        runtime: 'codex',
        startingRef: null,
        title: 'Write the report',
        turnId: 'wkt_1',
        type: 'worker-turn-start',
        workerId: 'wrk_1',
        workerMdRevisionId: 'rev_md_1',
        ...overrides,
    } satisfies WorkerTurnStartFrame;
}

function mintRoute(request: Request, url: URL, mints: string[], refuse?: Refusal) {
    if (url.pathname.startsWith('/repos/')) {
        return Response.json({ message: 'Not Found' }, { status: 404 });
    }
    return url.pathname.startsWith('/computer/workers/')
        ? answerMint(request, url, mints, refuse)
        : null;
}

async function answerMint(request: Request, url: URL, mints: string[], refuse?: Refusal) {
    const raw: unknown = await request.json();
    const expiresAt = '2026-11-20T00:00:00.000Z';
    if (url.pathname.endsWith('/push-credential')) {
        const body = workerPushCredentialRequestSchema.parse(raw);
        mints.push(`push-credential ${body.turnId}`);
        return Response.json({ expiresAt, state: 'minted', token: pushToken, turnId: body.turnId });
    }
    const body = workerTurnCredentialRequestSchema.parse(raw);
    mints.push(`turn-credential ${body.turnId}`);
    return refuse
        ? Response.json({ reason: refuse, state: 'refused', turnId: body.turnId })
        : Response.json({
              attempt: body.attempt,
              expiresAt,
              state: 'minted',
              token: turnToken,
              turnId: body.turnId,
          });
}

function seedRemote(root: string) {
    const git = (cwd: string, ...args: string[]) =>
        Bun.spawnSync(['git', '-c', 'user.name=T', '-c', 'user.email=t@haus.test', ...args], {
            cwd,
        });
    const seed = join(root, 'seed');
    git(root, 'init', '--quiet', '--initial-branch', 'main', seed);
    git(seed, 'commit', '--quiet', '--allow-empty', '-m', 'first');
    git(root, 'clone', '--quiet', '--bare', seed, join(root, 'remotes', 'acme', 'app.git'));
}
