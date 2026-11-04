import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CloudAgentRunRef } from '../provider.ts';
import { CloudAgentLaunchRejectedError } from '../provider.ts';
import { writeClaudeEnvironmentId } from '../settings.ts';
import type { ClaudeController, ClaudeSession, ClaudeSessionEvent } from './controller.ts';
import { createClaudeCloudAgentProvider, resolveClaudeEnvironment } from './provider.ts';

const restores: Array<() => Promise<void> | void> = [];
afterEach(async () => {
    for (const restore of restores.splice(0).reverse()) {
        await restore();
    }
});

const ref: CloudAgentRunRef = {
    provider: 'claude',
    providerAgentId: 'session_01Work',
    providerRunId: null,
    runId: 'car_run',
    workId: 'caw_work',
};

function recordedController(input: {
    events: Record<string, unknown>[];
    session?: Partial<ClaudeSession>;
}) {
    const calls: string[] = [];
    const controller: ClaudeController = {
        events(_id, stop) {
            const collected: ClaudeSessionEvent[] = [];
            for (const payload of [...input.events].reverse()) {
                const event = { createdAt: null, payload, sequence: '1' };
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

/** Not read by these tests: every one either never pins an environment or fails before reading it. */
const unusedDataRoot = '/dev/null/unused-cloud-agent-data-root';

test('a reading names the Run by the prompt Haus tagged', async () => {
    const { controller } = recordedController({
        events: [{ message: { content: 'an earlier prompt' }, type: 'user', uuid: 'old' }, prompt],
    });
    expect(
        await createClaudeCloudAgentProvider(unusedDataRoot, controller).read(ref)
    ).toMatchObject({
        providerRunId: 'prompt-1',
        status: 'running',
    });
});

test('cancel stops open background tasks, then interrupts once', async () => {
    const { calls, controller } = recordedController({
        events: [prompt, { subtype: 'task_started', task_id: 'bg1', type: 'system' }],
    });
    await createClaudeCloudAgentProvider(unusedDataRoot, controller).cancel(ref);
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
    await createClaudeCloudAgentProvider(unusedDataRoot, controller).cancel(ref);
    expect(calls).toEqual([]);
});

test('a follow-up Claude already took is not delivered twice, and resolves no fresh environment', async () => {
    const { calls, controller } = recordedController({ events: [prompt] });
    expect(
        await createClaudeCloudAgentProvider(unusedDataRoot, controller).send({
            idempotencyKey: 'car_run',
            instructions: 'Trim the copy.',
            model: null,
            providerAgentId: 'session_01Work',
            workId: 'caw_work',
        })
    ).toEqual({
        environmentId: null,
        environmentName: null,
        providerAgentId: 'session_01Work',
        providerRunId: null,
        providerUrl: 'https://claude.ai/code/session_01Work',
        status: 'queued',
    });
    expect(calls).toEqual([]);
});

test('Claude lists its three model tiers under the Claude family', async () => {
    const models = await createClaudeCloudAgentProvider(
        unusedDataRoot,
        recordedController({ events: [] }).controller
    ).listModels();
    expect(models.map((model) => model.id)).toEqual(['sonnet', 'opus', 'haiku']);
});

/** A host HOME whose Claude login is the file Haus's Claude Code Agents read. */
async function hostHome(): Promise<string> {
    const home = await mkdtemp(join(tmpdir(), 'haus-claude-cloud-provider-'));
    restores.push(() => rm(home, { force: true, recursive: true }));
    await mkdir(join(home, '.claude'), { recursive: true });
    await writeFile(
        join(home, '.claude', '.credentials.json'),
        JSON.stringify({
            claudeAiOauth: {
                accessToken: 'sk-ant-oat01-agents',
                expiresAt: Date.now() + 60 * 60_000,
                refreshToken: 'refresh',
            },
        })
    );
    const previousHome = process.env.HOME;
    process.env.HOME = home;
    restores.push(() => {
        process.env.HOME = previousHome;
    });
    return home;
}

function stubFetch(environments: Record<string, unknown>[]) {
    const original = globalThis.fetch;
    globalThis.fetch = ((url: URL | string) => {
        if (String(url) === 'https://api.anthropic.com/api/oauth/profile') {
            return Promise.resolve(
                Response.json({
                    account: { email: 'zach@example.com' },
                    organization: { uuid: 'org-uuid' },
                })
            );
        }
        if (String(url) === 'https://api.anthropic.com/v1/environment_providers') {
            return Promise.resolve(Response.json({ environments }));
        }
        throw new Error(`Unstubbed fetch: ${url}`);
    }) as typeof fetch;
    restores.push(() => {
        globalThis.fetch = original;
    });
}

async function claudeDataRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'haus-claude-cloud-settings-'));
    restores.push(() => rm(root, { force: true, recursive: true }));
    return root;
}

const startInput = {
    idempotencyKey: 'car_run',
    instructions: 'Trim the copy.',
    model: null,
    ref: null,
    repository: 'haus/haus',
    title: 'Trim the copy',
    workId: 'caw_work',
};

test('a pin that no longer exists fails the launch before any checkout', async () => {
    await hostHome();
    stubFetch([]);
    const dataRoot = await claudeDataRoot();
    await writeClaudeEnvironmentId(dataRoot, 'env_gone');

    const rejection = createClaudeCloudAgentProvider(dataRoot).start(startInput);
    await expect(rejection).rejects.toBeInstanceOf(CloudAgentLaunchRejectedError);
    await expect(rejection).rejects.toThrow('env_gone');
});

test('an archived pin fails the launch by name', async () => {
    await hostHome();
    stubFetch([
        { environment_id: 'env_archived', kind: 'anthropic_cloud', name: 'Old', state: 'archived' },
    ]);
    const dataRoot = await claudeDataRoot();
    await writeClaudeEnvironmentId(dataRoot, 'env_archived');

    await expect(createClaudeCloudAgentProvider(dataRoot).start(startInput)).rejects.toThrow(
        'env_archived'
    );
});

test('a valid pin resolves to the environment start() reports', async () => {
    await hostHome();
    stubFetch([
        { environment_id: 'env_live', kind: 'anthropic_cloud', name: 'BidBeacon', state: 'active' },
    ]);
    const dataRoot = await claudeDataRoot();
    await writeClaudeEnvironmentId(dataRoot, 'env_live');

    expect(await resolveClaudeEnvironment(dataRoot)).toEqual({ id: 'env_live', name: 'BidBeacon' });
});

test('an unpinned Computer resolves no environment, and never calls the environment list', async () => {
    const dataRoot = await claudeDataRoot();

    expect(await resolveClaudeEnvironment(dataRoot)).toBeNull();
});
