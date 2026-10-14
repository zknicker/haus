import { afterEach, expect, test } from 'bun:test';
import { confirmedClaudeInterrupt, interruptClaudeCloud } from './interrupt.ts';
import { interruptFixture } from './interrupt-fixture.ts';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
    for (const close of cleanup.splice(0)) {
        await close();
    }
});
async function fixture() {
    const f = await interruptFixture();
    cleanup.push(f.close);
    return f;
}

test('native stop pins the resumed prompt and waits for its exact receipt plus terminal tasks', async () => {
    const f = await fixture();
    const task = f.events.find((event) => event.task?.id === 'active');
    if (!task?.task) {
        throw new Error('fixture');
    }
    task.task.terminal = false;
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    expect(f.taskPosts).toHaveLength(1);
    expect(f.posts).toHaveLength(0);
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    expect(await confirmedClaudeInterrupt(f.computer, f.ref, f.stamp)).toBeNull();
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    expect(await confirmedClaudeInterrupt(f.computer, f.ref, f.stamp)).toMatchObject({
        responseUuid: 'receipt',
    });
    expect(f.posts).toHaveLength(1);
    f.events.unshift({ sequence: '13', uuid: 'later', promptId: 'later' });
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    expect(f.posts).toHaveLength(1);
});

test('lost HTTP receipt is reconciled after restart without another interrupt', async () => {
    const f = await fixture();
    f.ambiguous();
    await expect(interruptClaudeCloud(f.computer, f.ref, undefined, f.controller)).rejects.toThrow(
        'lost'
    );
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    expect(await confirmedClaudeInterrupt(f.computer, f.ref, f.stamp)).not.toBeNull();
    expect(f.posts).toHaveLength(1);
});

test('idle and HTTP acceptance alone never confirm or retry an interrupt', async () => {
    const f = await fixture();
    f.noResponse();
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    expect(await confirmedClaudeInterrupt(f.computer, f.ref, f.stamp)).toBeNull();
    expect(f.posts).toHaveLength(1);
});

test('still-queued native work prevents cancellation confirmation', async () => {
    const f = await fixture();
    f.queued(1);
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    await expect(interruptClaudeCloud(f.computer, f.ref, undefined, f.controller)).rejects.toThrow(
        'complete interruption'
    );
    expect(await confirmedClaudeInterrupt(f.computer, f.ref, f.stamp)).toBeNull();
});

test('provisioning native prompt is admitted only by an exact fenced work/run tag', async () => {
    const f = await fixture();
    f.snapshot.prompts.length = 0;
    f.snapshot.run.providerRunId = null;
    f.ref.providerRunId = null;
    const event = f.events[0];
    if (!event) {
        throw new Error('fixture');
    }
    await expect(interruptClaudeCloud(f.computer, f.ref, undefined, f.controller)).rejects.toThrow(
        'identity'
    );
    event.workRun = { workId: f.ref.workId, runId: 'car_other' };
    await expect(interruptClaudeCloud(f.computer, f.ref, undefined, f.controller)).rejects.toThrow(
        'identity'
    );
    event.workRun.runId = f.ref.runId;
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    expect(await confirmedClaudeInterrupt(f.computer, f.ref, f.stamp)).not.toBeNull();
});

test('canonical terminal Runs leave old cancellation monitors without another controller request', async () => {
    const f = await fixture();
    f.snapshot.run.status = 'cancelled';
    f.snapshot.work.cancelRequestedAt = null;
    f.controller.events = () => Promise.reject(new Error('must not reach native controller'));
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    expect(f.posts).toHaveLength(0);
});

test('ambiguous background task stops recover their exact receipt without another task stop', async () => {
    const f = await fixture();
    const task = f.events.find((event) => event.task?.id === 'active');
    if (!task?.task) {
        throw new Error('fixture');
    }
    task.task.terminal = false;
    f.taskAmbiguous();
    await expect(interruptClaudeCloud(f.computer, f.ref, undefined, f.controller)).rejects.toThrow(
        'Task stop HTTP response lost'
    );
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    expect(await confirmedClaudeInterrupt(f.computer, f.ref, f.stamp)).not.toBeNull();
    expect(f.taskPosts).toHaveLength(1);
    expect(f.posts).toHaveLength(1);
});

test('known native schedules block cancellation instead of equating idle with no future work', async () => {
    const f = await fixture();
    f.snapshot.stopEvidence = {
        promptId: 'prompt_resume',
        backgroundTasks: 1,
        sessionCrons: 1,
        observedAt: f.stamp,
    };
    await expect(interruptClaudeCloud(f.computer, f.ref, undefined, f.controller)).rejects.toThrow(
        'scheduled work'
    );
    expect(f.posts).toHaveLength(0);
});

test('an admitted native follow-up tag fences callback-lagging queued work', async () => {
    const f = await fixture();
    f.events.unshift({
        sequence: '20',
        uuid: 'native_queued',
        promptId: 'native_queued',
        workRun: { workId: f.ref.workId, runId: f.ref.runId },
    });
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    expect(await confirmedClaudeInterrupt(f.computer, f.ref, f.stamp)).not.toBeNull();
    expect(f.posts).toHaveLength(1);
});

test('a newer untagged native prompt never receives the prior work interrupt', async () => {
    const f = await fixture();
    f.events.unshift({ sequence: '20', uuid: 'human_followup', promptId: 'human_followup' });
    await expect(interruptClaudeCloud(f.computer, f.ref, undefined, f.controller)).rejects.toThrow(
        'stale'
    );
    expect(f.posts).toHaveLength(0);
    expect(f.taskPosts).toHaveLength(0);
});

test('cancellation reaches the hidden native Run behind 21 queued Runs and guards its schedules', async () => {
    const f = await fixture();
    const active = structuredClone(f.snapshot);
    const queued = Array.from({ length: 21 }, (_, index) => ({
        ...f.snapshot.run,
        runId: `car_queued${index.toString().padStart(16, '0')}`,
        status: 'queued' as const,
        providerRunId: null,
    }));
    const latest = queued[0];
    if (!latest) {
        throw new Error('fixture');
    }
    f.snapshot.work.runs = queued.slice(0, 20);
    f.snapshot.run = latest;
    f.snapshot.prompts = [];
    f.snapshot.cancellation = {
        runIds: [...queued.map((run) => run.runId), active.run.runId],
        activeRunId: active.run.runId,
    };
    f.ref.runId = latest.runId;
    f.ref.providerRunId = null;
    active.work = f.snapshot.work;
    active.cancellation = f.snapshot.cancellation;
    active.stopEvidence = {
        promptId: 'prompt_resume',
        backgroundTasks: 1,
        sessionCrons: 1,
        observedAt: f.stamp,
    };
    f.snapshots.set(active.run.runId, active);
    const native = f.events[0];
    if (!native) {
        throw new Error('fixture');
    }
    native.workRun = { workId: f.ref.workId, runId: active.run.runId };
    await expect(interruptClaudeCloud(f.computer, f.ref, undefined, f.controller)).rejects.toThrow(
        'scheduled work'
    );
    expect(f.posts).toHaveLength(0);
    active.stopEvidence = null;
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    active.stopEvidence = {
        promptId: 'prompt_resume',
        backgroundTasks: 1,
        sessionCrons: 1,
        observedAt: f.stamp,
    };
    await expect(interruptClaudeCloud(f.computer, f.ref, undefined, f.controller)).rejects.toThrow(
        'scheduled work'
    );
    expect(await confirmedClaudeInterrupt(f.computer, f.ref, f.stamp)).toBeNull();
    active.stopEvidence = null;
    await interruptClaudeCloud(f.computer, f.ref, undefined, f.controller);
    expect(
        await confirmedClaudeInterrupt(f.computer, { ...f.ref, runId: active.run.runId }, f.stamp)
    ).not.toBeNull();
    expect(f.posts).toHaveLength(1);
});
