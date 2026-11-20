import { testRule } from './rule-tester.mjs';
import { workerStatusWrites } from './worker-status-writes.mjs';

testRule('worker-status-writes', workerStatusWrites, {
    valid: [
        'await db.update(workersTable).set({ updatedAt: now });',
        'await db.update(workerTurnsTable).set(runObservationUpdate(observation));',
        'await tx.update(workersTable).set({ ...projectWorker(run), updatedAt });',
        "await db.update(tasksTable).set({ status: 'done' });",
        'await db.update(workerTurnsTable).set({ statusDetail: detail });',
    ],
    invalid: [
        {
            code: "await db.update(workerTurnsTable).set({ status: 'failed' });",
            errors: [{ messageId: 'statusWrite' }],
        },
        {
            code: "await tx.update(workersTable).set({ status: 'queued', updatedAt: now });",
            errors: [{ messageId: 'statusWrite' }],
        },
        {
            code: 'await tx.update(workersTable).set({ status, updatedAt: now });',
            errors: [{ messageId: 'statusWrite' }],
        },
    ],
});
