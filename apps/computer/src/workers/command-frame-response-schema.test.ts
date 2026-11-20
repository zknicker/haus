import { expect, test } from 'bun:test';
import { workerStopCommandSchema } from '@haus/api';
import {
    cloudAgentCapabilityRequestResponseSchema,
    workerReconcileCommandResponseSchema,
    workerStopCommandResponseSchema,
    workerTurnStartResponseSchema,
} from './command-frame-response-schema.ts';

const stop = {
    place: { kind: 'cursor' },
    providerAgentId: 'bc_abc',
    providerRunId: 'run_abc',
    turnId: 'wkt_1234567890abcdef',
    type: 'worker-stop',
    workerId: 'wkr_1234567890abcdef',
};

test('the canonical strict stop command schema rejects a field it does not know', () => {
    expect(() => workerStopCommandSchema.parse({ ...stop, futureStopField: true })).toThrow(
        /futureStopField/
    );
});

test('the Computer response schema tolerates an unknown field on a stop command', () => {
    const parsed = workerStopCommandResponseSchema.parse({ ...stop, futureStopField: true });
    expect(parsed.turnId).toBe('wkt_1234567890abcdef');
});

test('the Computer response schema tolerates an unknown field on a reconcile command, at every nesting level', () => {
    const parsed = workerReconcileCommandResponseSchema.parse({
        futureReconcileField: true,
        type: 'worker-reconcile',
        workers: [
            {
                futureEntryField: true,
                place: { kind: 'cursor' },
                providerAgentId: 'bc_abc',
                providerRunId: 'run_abc',
                status: 'running',
                stopRequested: false,
                turnId: 'wkt_1234567890abcdef',
                workerId: 'wkr_1234567890abcdef',
            },
        ],
    });
    expect(parsed.workers[0]?.workerId).toBe('wkr_1234567890abcdef');
});

test('the Computer response schema tolerates an unknown field on a turn start, at every nesting level', () => {
    const parsed = workerTurnStartResponseSchema.parse({
        futureStartField: true,
        input: 'Fix the flaky delivery test.',
        model: {
            droppedParams: [],
            fallbackFrom: null,
            futureModelField: true,
            id: null,
            params: [],
        },
        place: { kind: 'claude' },
        predecessorTurnIds: [],
        providerAgentId: null,
        repository: 'haus/haus',
        startingRef: null,
        title: 'Fix the flaky delivery test',
        turnId: 'wkt_1234567890abcdef',
        type: 'worker-turn-start',
        workerId: 'wkr_1234567890abcdef',
    });
    expect(parsed.input).toBe('Fix the flaky delivery test.');
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
