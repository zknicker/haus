import { afterAll, expect, test } from 'bun:test';
import type { AgentCommand, ComputerSecretsStatus } from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import { SecretsReplyOffice } from './secrets-reply-office.ts';

const computerId = 'cmp_1234567890123456';
const runtime = makeTestRuntime();
const status: ComputerSecretsStatus = { connected: false, provider: '1password' };

afterAll(() => runtime.dispose());

test('relays one operation and settles on the matching Computer result', async () => {
    const frames: AgentCommand[] = [];
    const office = new SecretsReplyOffice({
        runtime,
        send: (_, frame) => {
            frames.push(frame);
            return true;
        },
    });
    const pending = office.request(computerId, { kind: 'disconnect' });
    const frame = frames[0];
    if (frame?.type !== 'computer-secrets-request') {
        throw new Error('expected a computer-secrets-request frame');
    }
    const result = {
        requestId: frame.requestId,
        result: status,
        type: 'computer-secrets-result' as const,
    };

    expect(office.accept('cmp_0000000000000000', result)).toBe(false);
    expect(office.accept(computerId, result)).toBe(true);
    await expect(pending).resolves.toEqual(status);
    expect(office.accept(computerId, result)).toBe(false);
});

test('an offline Computer fails fast', async () => {
    const office = new SecretsReplyOffice({ runtime, send: () => false });
    await expect(office.request(computerId, { kind: 'disconnect' })).rejects.toThrow(
        'The selected Computer is offline.'
    );
});

test('a Computer error settles as a failure', async () => {
    const frames: AgentCommand[] = [];
    const office = new SecretsReplyOffice({
        runtime,
        send: (_, frame) => {
            frames.push(frame);
            return true;
        },
    });
    const pending = office.request(computerId, { kind: 'disconnect' });
    const frame = frames[0];
    if (frame?.type !== 'computer-secrets-request') {
        throw new Error('expected a computer-secrets-request frame');
    }
    office.accept(computerId, {
        error: 'Could not install Varlock on this Computer.',
        requestId: frame.requestId,
        type: 'computer-secrets-result',
    });
    await expect(pending).rejects.toThrow('Could not install Varlock on this Computer.');
});
