import { expect, test } from 'bun:test';
import { cloudAgentCancelCommandSchema } from '@haus/api';
import {
    cloudAgentCancelCommandResponseSchema,
    cloudAgentCapabilityRequestResponseSchema,
    cloudAgentReconcileCommandResponseSchema,
} from './command-frame-response-schema.ts';

test('the canonical strict cancel command schema rejects a field it does not know', () => {
    expect(() =>
        cloudAgentCancelCommandSchema.parse({
            futureCancelField: true,
            provider: 'cursor',
            providerAgentId: 'bc_abc',
            providerRunId: 'run_abc',
            runId: 'car_1234567890abcdef',
            type: 'cloud-agent-cancel',
            workId: 'caw_1234567890abcdef',
        })
    ).toThrow(/futureCancelField/);
});

test('the Computer response schema tolerates an unknown field on a cancel command', () => {
    const parsed = cloudAgentCancelCommandResponseSchema.parse({
        futureCancelField: true,
        provider: 'cursor',
        providerAgentId: 'bc_abc',
        providerRunId: 'run_abc',
        runId: 'car_1234567890abcdef',
        type: 'cloud-agent-cancel',
        workId: 'caw_1234567890abcdef',
    });
    expect(parsed.runId).toBe('car_1234567890abcdef');
});

test('the Computer response schema tolerates an unknown field on a reconcile command, at every nesting level', () => {
    const parsed = cloudAgentReconcileCommandResponseSchema.parse({
        futureReconcileField: true,
        type: 'cloud-agent-reconcile',
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
