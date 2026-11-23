import { expect, test } from 'bun:test';
import { computerInventorySchema } from './computer-inventory.ts';
import {
    type WorkerTurnCredentialResponse,
    workerPushCredentialResponseSchema,
    workerTurnCredentialRequestSchema,
    workerTurnCredentialResponseSchema,
} from './worker-credentials.ts';
import { type WorkerPlacesResponse, workerPlacesResponseSchema } from './worker-places.ts';
import { work } from './worker-record-fixture.ts';
import { workerRefusalCodes } from './worker-refusals.ts';
import {
    type WorkerReportDraft,
    workerReportDraftSchema,
    workerReportInputSchema,
} from './worker-report-draft.ts';
import type { WorkerRuntimeReadiness } from './worker-runtime.ts';
import {
    type ProjectSetDefaultWorkerPlaceInput,
    computerSetWorkersInputSchema,
    projectSetDefaultWorkerPlaceInputSchema,
} from './worker-settings.ts';
import { type Worker, workerSchema } from './worker-shared.ts';
import { type AgentWorkerStartInput, agentWorkerStartInputSchema } from './worker.ts';

test('a Worker record carries its runtime, model, branch, and WORKER.md revision', () => {
    const onComputer: Worker = {
        ...workerSchema.parse(work),
        branch: 'haus/sec-12-wkr_1234567890abcdef',
        model: 'gpt-5.5',
        place: { computerId: 'cmp_abcdefghijklmnop', computerName: 'mini', kind: 'computer' },
        runtime: 'codex',
        workerMdRevisionId: 'rev_1234567890abcdef',
    };
    expect(workerSchema.parse(onComputer)).toEqual(onComputer);
    expect(workerSchema.parse(work).runtime).toBeNull();
    expect(workerSchema.safeParse({ ...work, runtime: 'grok-build' }).success).toBe(false);
});

test('a start names one repo, lower-cased, and its place, runtime, and model are optional', () => {
    const brief = { brief: 'Fix it.', nonce: 'n-1', task: 'SEC-12', title: 'Fix the flake' };
    expect(agentWorkerStartInputSchema.safeParse(brief).success).toBe(false);
    expect(agentWorkerStartInputSchema.parse({ ...brief, repository: 'Haus/Haus' })).toEqual({
        ...brief,
        repository: 'haus/haus',
        startingRef: null,
    });
    const full: AgentWorkerStartInput = {
        ...brief,
        model: 'gpt-5.5',
        place: 'mini',
        repository: 'haus/haus',
        runtime: 'claude-code',
        startingRef: null,
    };
    expect(agentWorkerStartInputSchema.parse(full)).toEqual(full);
});

test('places list each Computer with its switch, runtimes, repo folders, and slots', () => {
    const response: WorkerPlacesResponse = {
        places: [
            {
                computerId: 'cmp_abcdefghijklmnop',
                freeSlots: 3,
                kind: 'computer',
                limit: 4,
                name: 'mini',
                online: true,
                projectDefault: true,
                ready: true,
                repoFolders: ['haus/haus'],
                runtimes: [
                    { detail: null, ready: true, runtime: 'claude-code' },
                    { detail: 'Not signed in', ready: false, runtime: 'codex' },
                ],
                workersEnabled: true,
            },
            { freeSlots: 10, kind: 'cursor', limit: 10, projectDefault: false, ready: false },
        ],
        task: 'SEC-12',
    };
    expect(workerPlacesResponseSchema.parse(response)).toEqual(response);
    expect(
        workerPlacesResponseSchema.safeParse({
            ...response,
            places: [{ ...response.places[1], runtimes: [] }],
        }).success
    ).toBe(false);
});

test('a report needs its ask exactly when it is needs-you, and drafts drop the Message', () => {
    expect(
        workerReportInputSchema.parse({ outcome: 'done', text: 'Opened the pull request.' })
    ).toEqual({
        ask: null,
        outcome: 'done',
        person: null,
        pullRequestUrls: [],
        text: 'Opened the pull request.',
    });
    expect(
        workerReportInputSchema.safeParse({ outcome: 'needs-you', text: 'Stuck.' }).success
    ).toBe(false);
    const draft: WorkerReportDraft = {
        ask: 'Which key?',
        outcome: 'needs-you',
        personId: 'usr_zach',
        pullRequestUrls: [],
        text: 'Stuck on the signing key.',
    };
    expect(workerReportDraftSchema.parse(draft)).toEqual(draft);
    expect(workerReportDraftSchema.safeParse({ ...draft, messageId: 'msg_1' }).success).toBe(false);
});

test('a turn credential mints for its attempt or names why the fence refused', () => {
    const credentialHash = 'a'.repeat(64);
    expect(
        workerTurnCredentialRequestSchema.parse({ attempt: 1, credentialHash, turnId: 'wkt_1' })
    ).toEqual({ attempt: 1, credentialHash, turnId: 'wkt_1' });
    expect(
        workerTurnCredentialRequestSchema.safeParse({ attempt: 1, turnId: 'wkt_1' }).success
    ).toBe(false);
    const minted: WorkerTurnCredentialResponse = {
        attempt: 1,
        expiresAt: '2026-11-20T00:00:00.000Z',
        state: 'minted',
        token: 'hwt_'.padEnd(40, 'a'),
        turnId: 'wkt_1',
    };
    expect(workerTurnCredentialResponseSchema.parse(minted)).toEqual(minted);
    const refused: WorkerTurnCredentialResponse = {
        reason: 'stale-attempt',
        state: 'refused',
        turnId: 'wkt_1',
    };
    expect(workerTurnCredentialResponseSchema.parse(refused)).toEqual(refused);
    expect(
        workerPushCredentialResponseSchema.safeParse({ ...refused, reason: 'stale-attempt' })
            .success
    ).toBe(false);
});

test('the new refusals ride the Worker refusal codes', () => {
    expect(workerRefusalCodes).toContain('WORKER_PLACE_OFF');
    expect(workerRefusalCodes).not.toContain('WORKER_REPO_UNKNOWN');
    expect(workerRefusalCodes).not.toContain('WORKER_REPO_NOT_LINKED');
    expect(workerRefusalCodes).toContain('WORKER_RUNTIME_UNAVAILABLE');
    expect(workerRefusalCodes).toContain('WORKER_OPTION_CLOUD');
});

test('inventory reports Worker runtimes, and an older inventory reports none', () => {
    const runtimes: WorkerRuntimeReadiness[] = [
        { detail: null, ready: true, runtime: 'claude-code' },
    ];
    expect(
        computerInventorySchema.parse({ runtimes: [], workerRuntimes: runtimes }).workerRuntimes
    ).toEqual(runtimes);
    expect(computerInventorySchema.parse({ runtimes: [] }).workerRuntimes).toBeUndefined();
});

test('settings inputs carry the switch and the default place', () => {
    expect(
        computerSetWorkersInputSchema.parse({
            computerId: 'cmp_one',
            enabled: true,
            limit: 6,
            serverId: 'srv_one',
        })
    ).toEqual({ computerId: 'cmp_one', enabled: true, limit: 6, serverId: 'srv_one' });
    expect(
        computerSetWorkersInputSchema.safeParse({
            computerId: 'cmp_one',
            enabled: true,
            limit: 51,
            serverId: 'srv_one',
        }).success
    ).toBe(false);
    const toComputer: ProjectSetDefaultWorkerPlaceInput = {
        place: { computerId: 'cmp_one', kind: 'computer' },
        projectId: 'cht_ops',
        serverId: 'srv_one',
    };
    expect(projectSetDefaultWorkerPlaceInputSchema.parse(toComputer)).toEqual(toComputer);
    expect(
        projectSetDefaultWorkerPlaceInputSchema.parse({ ...toComputer, place: null }).place
    ).toBeNull();
});
