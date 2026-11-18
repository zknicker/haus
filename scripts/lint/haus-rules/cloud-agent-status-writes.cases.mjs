import { cloudAgentStatusWrites } from './cloud-agent-status-writes.mjs';
import { testRule } from './rule-tester.mjs';

testRule('cloud-agent-status-writes', cloudAgentStatusWrites, {
    valid: [
        'await db.update(cloudAgentWorkTable).set({ updatedAt: now });',
        'await db.update(cloudAgentRunsTable).set(runObservationUpdate(observation));',
        'await tx.update(cloudAgentWorkTable).set({ ...projectCloudAgentWork(run), updatedAt });',
        "await db.update(tasksTable).set({ status: 'done' });",
        'await db.update(cloudAgentRunsTable).set({ statusDetail: detail });',
    ],
    invalid: [
        {
            code: "await db.update(cloudAgentRunsTable).set({ status: 'failed' });",
            errors: [{ messageId: 'statusWrite' }],
        },
        {
            code: "await tx.update(cloudAgentWorkTable).set({ status: 'queued', updatedAt: now });",
            errors: [{ messageId: 'statusWrite' }],
        },
        {
            code: 'await tx.update(cloudAgentWorkTable).set({ status, updatedAt: now });',
            errors: [{ messageId: 'statusWrite' }],
        },
    ],
});
