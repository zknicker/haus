import { expect, test } from 'bun:test';
import type { CloudAgentRunRef } from '../provider.ts';
import type { ClaudeController, ClaudeSession, ClaudeSessionEvent } from './controller.ts';
import { createClaudeCloudAgentProvider } from './provider.ts';

const ref: CloudAgentRunRef = {
    provider: 'claude',
    providerAgentId: 'session_01Work',
    providerRunId: null,
    runId: 'car_run',
    workId: 'caw_work',
};

function recordedController(input: {
    events: Array<Record<string, unknown>>;
    session?: Partial<ClaudeSession>;
}) {
    const calls: string[] = [];
    const controller: ClaudeController = {
        events(_id, stop) {
            const collected: ClaudeSessionEvent[] = [];
            for (const payload of [...input.events].reverse()) {
                const event = { payload, sequence: '1' };
                collected.push(event);
                if (stop(event)) {
                    break;
                }
            }
            return Promise.resolve(collected);
        },
        interrupt(_id, requestId) {
            calls.push(`interrupt ${requestId}`);
            return Promise.resolve();
        },
        session: () =>
            Promise.resolve({
                lastEventAt: null,
                pendingAction: null,
                status: 'active',
                workerStatus: 'running',
                ...input.session,
            }),
        stopTask(_id, stop) {
            calls.push(`stop ${stop.taskId}`);
            return Promise.resolve();
        },
    };
    return { calls, controller };
}

const prompt = {
    message: { content: 'HAUS_CLOUD_RUN=caw_work/car_run\n\nTrim the copy.' },
    type: 'user',
    uuid: 'prompt-1',
};

test('a reading names the Run by the prompt Haus tagged', async () => {
    const { controller } = recordedController({
        events: [{ message: { content: 'an earlier prompt' }, type: 'user', uuid: 'old' }, prompt],
    });
    expect(await createClaudeCloudAgentProvider(controller).read(ref)).toMatchObject({
        providerRunId: 'prompt-1',
        status: 'running',
    });
});

test('cancel stops open background tasks, then interrupts once', async () => {
    const { calls, controller } = recordedController({
        events: [prompt, { subtype: 'task_started', task_id: 'bg1', type: 'system' }],
    });
    await createClaudeCloudAgentProvider(controller).cancel(ref);
    expect(calls).toEqual(['stop bg1', 'interrupt haus-cancel-car_run']);
});

test('cancel sends nothing once Claude answered Haus’s interrupt', async () => {
    const { calls, controller } = recordedController({
        events: [
            prompt,
            {
                response: { request_id: 'haus-cancel-car_run', subtype: 'success' },
                type: 'control_response',
            },
        ],
    });
    await createClaudeCloudAgentProvider(controller).cancel(ref);
    expect(calls).toEqual([]);
});

test('a follow-up Claude already took is not delivered twice', async () => {
    const { calls, controller } = recordedController({ events: [prompt] });
    expect(
        await createClaudeCloudAgentProvider(controller).send({
            idempotencyKey: 'car_run',
            instructions: 'Trim the copy.',
            model: null,
            providerAgentId: 'session_01Work',
            workId: 'caw_work',
        })
    ).toEqual({
        providerAgentId: 'session_01Work',
        providerRunId: null,
        providerUrl: 'https://claude.ai/code/session_01Work',
        status: 'queued',
    });
    expect(calls).toEqual([]);
});

test('Claude lists its three model tiers under the Claude family', async () => {
    const models = await createClaudeCloudAgentProvider(
        recordedController({ events: [] }).controller
    ).listModels();
    expect(models.map((model) => model.id)).toEqual(['sonnet', 'opus', 'haiku']);
});
