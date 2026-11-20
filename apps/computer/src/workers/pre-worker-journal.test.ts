import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import {
    reconcileEntry,
    registerSupervisorFixture,
    serverId,
    turnRef,
    turnStartFrame,
} from './worker-supervisor.fixture.ts';

const supervisors = registerSupervisorFixture();
const workerId = 'caw_preworker123456';

test('a follow-up a pre-Workers Computer held drains to the Server', async () => {
    const f = await supervisors(createFakeCloudAgentProvider());
    const frame = turnStartFrame({
        providerAgentId: 'bc_held',
        turnId: 'car_heldbefore12345',
        workerId,
    });
    await writePreWorkerRecord(
        f.dataRoot,
        frame.turnId,
        '{"phase":"pending","workId":"caw_preworker123456","instructions":"Address the review comments.","model":null,"providerAgentId":"bc_held","interrupt":false,"predecessors":[{"provider":"cursor","workId":"caw_preworker123456","runId":"car_priorrun1234567","providerAgentId":"bc_held","providerRunId":"run_prior"}],"delivery":null}'
    );
    const daemon = f.start();
    await daemon.work.reconcile([reconcileEntry(frame)]);
    expect(daemon.frames.filter((sent) => sent.type === 'worker-follow-up-drain')).toEqual([
        {
            instructions: 'Address the review comments.',
            predecessorTurnIds: ['car_priorrun1234567'],
            providerAgentId: 'bc_held',
            providerRunId: null,
            turnId: 'car_heldbefore12345',
            type: 'worker-follow-up-drain',
            workerId,
        },
    ]);
    expect(f.provider.sends).toEqual([]);
});

test('a launch a pre-Workers Computer recorded is monitored at its provider address', async () => {
    const f = await supervisors(createFakeCloudAgentProvider());
    const frame = turnStartFrame({ turnId: 'car_launchedbefore1', workerId });
    await writePreWorkerRecord(
        f.dataRoot,
        frame.turnId,
        '{"phase":"launched","workId":"caw_preworker123456","launch":{"environmentId":null,"environmentName":null,"providerAgentId":"bc_live","providerRunId":"run_live","providerUrl":"https://cursor.com/agents?id=bc_live","status":"running","startedAt":"2026-11-01T10:00:00.000Z"},"autoInterrupted":false}'
    );
    const daemon = f.start();
    await daemon.work.reconcile([reconcileEntry(frame)]);
    expect(daemon.observations()[0]).toMatchObject({
        providerAgentId: 'bc_live',
        providerRunId: 'run_live',
        providerUrl: 'https://cursor.com/agents?id=bc_live',
        status: 'running',
        turnId: 'car_launchedbefore1',
        workerId,
    });
    expect(await f.journal.read(serverId, turnRef(frame))).toEqual({
        autoInterrupted: false,
        launch: {
            environmentId: null,
            environmentName: null,
            providerAgentId: 'bc_live',
            providerRunId: 'run_live',
            providerUrl: 'https://cursor.com/agents?id=bc_live',
            startedAt: '2026-11-01T10:00:00.000Z',
            status: 'running',
        },
        phase: 'launched',
        workerId,
    });
});

async function writePreWorkerRecord(dataRoot: string, runId: string, contents: string) {
    const directory = join(dataRoot, 'cloud-agent-launches', sha256(serverId));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, `${sha256(runId)}.json`), contents, { mode: 0o600 });
}

function sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
}
