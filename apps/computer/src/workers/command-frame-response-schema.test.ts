import { expect, test } from 'bun:test';
import { workerStopCommandSchema } from '@haus/api';
import {
    workerStopCommandResponseSchema,
    cloudAgentCapabilityRequestResponseSchema,
    workerReconcileCommandResponseSchema,
} from './command-frame-response-schema.ts';

test('the canonical strict cancel command schema rejects a field it does not know', () => {
    expect(() =>
        workerStopCommandSchema.parse({
            futureCancelField: true,
            provider: 'cursor',
            providerAgentId: 'bc_abc',
            providerRunId: 'run_abc',
            runId: 'car_1234567890abcdef',
            type: 'worker-stop',
            workId: 'caw_1234567890abcdef',
        })
    ).toThrow(/futureCancelField/);
});

test('the Computer response schema tolerates an unknown field on a cancel command', () => {
    const parsed = workerStopCommandResponseSchema.parse({
        futureCancelField: true,
        provider: 'cursor',
        providerAgentId: 'bc_abc',
        providerRunId: 'run_abc',
        runId: 'car_1234567890abcdef',
        type: 'worker-stop',
        workId: 'caw_1234567890abcdef',
    });
    expect(parsed.runId).toBe('car_1234567890abcdef');
});

test('the Computer response schema tolerates an unknown field on a reconcile command, at every nesting level', () => {
    const parsed = workerReconcileCommandResponseSchema.parse({
        futureReconcileField: true,
        type: 'worker-reconcile',
        work: [
            {
                cancelRequested: false,
                futureEntryField: true,
                provider: 'cursor',
                providerAgentId: 'bc_abc',
                providerRunId: 'run_abc',
                runId: 'car_1234567890abcdef',
                status: 'running',
                workId: 'caw_1234567890abcdef',
            },
        ],
    });
    expect(parsed.work[0]?.workId).toBe('caw_1234567890abcdef');
});

test('the Computer response schema tolerates an unknown field on a capability request, at every nesting level', () => {
    const parsed = cloudAgentCapabilityRequestResponseSchema.parse({
        futureCapabilityField: true,
        operation: {
            environmentId: 'env_claude',
            futureOperationField: true,
            kind: 'set-environment',
        },
        provider: 'claude',
        requestId: 'cap_1234567890',
        type: 'cloud-agent-capability-request',
    });
    expect(parsed.operation.kind).toBe('set-environment');
});
