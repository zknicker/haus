import { expect, spyOn, test } from 'bun:test';
import { Agent, AgentBusyError } from '@cursor/sdk';
import { createCursorSdkTransport } from './sdk-transport.ts';

test('SDK follow-up resumes the existing Agent, forwards idempotency, and disposes on refusal', async () => {
    const busy = new AgentBusyError('Agent already has an active run');
    const sends: unknown[] = [];
    let disposed = false;
    const resume = spyOn(Agent, 'resume').mockResolvedValue({
        agentId: 'existing-agent',
        close() {},
        downloadArtifact: () => Promise.reject(new Error('unused')),
        getUsage: () => Promise.reject(new Error('unused')),
        listArtifacts: () => Promise.resolve([]),
        model: undefined,
        reload: () => Promise.resolve(),
        send(message, options) {
            sends.push({ message, options });
            return Promise.reject(busy);
        },
        [Symbol.asyncDispose]() {
            disposed = true;
            return Promise.resolve();
        },
    });
    const create = spyOn(Agent, 'create');
    try {
        await expect(
            createCursorSdkTransport().send({
                agentId: 'existing-agent',
                idempotencyKey: 'follow-up-1',
                instructions: 'Fix the review.',
                model: 'gpt-5.4-nano',
            })
        ).rejects.toBe(busy);
        expect(resume).toHaveBeenCalledWith('existing-agent', { cloud: {} });
        expect(sends).toEqual([
            {
                message: 'Fix the review.',
                options: { idempotencyKey: 'follow-up-1', model: { id: 'gpt-5.4-nano' } },
            },
        ]);
        expect(disposed).toBe(true);
        expect(create).not.toHaveBeenCalled();
    } finally {
        resume.mockRestore();
        create.mockRestore();
    }
});
