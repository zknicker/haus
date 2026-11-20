import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Message, ProviderAuth, TranscriptContext } from '@earendil-works/pi-ai';
import { createModels, createProvider } from '@earendil-works/pi-ai/models';
import {
    createFauxCore,
    type FauxResponseStep,
    fauxProvider,
} from '@earendil-works/pi-ai/providers/faux';
import type { RunnerModelConnection } from '@haus/api';
import type { RunTools } from '../run-context.ts';
import { cleanups } from '../runner-test-server.ts';
import type { TurnEvent } from '../turn/turn-event.ts';
import { createPiHarness } from './pi-driver.ts';

export function fauxHarness(responses: FauxResponseStep[]) {
    const faux = fauxProvider({ models: [{ id: 'faux-1', reasoning: true }, { id: 'gpt-faux' }] });
    faux.setResponses(responses);
    const models = createModels();
    models.setProvider(faux.provider);
    const harness = createPiHarness({
        log: () => undefined,
        maxWarm: 2,
        models: () => ({ models, providerId: faux.provider.id }),
    });
    cleanups.push(() => harness.close());
    return harness;
}

export function fauxProviderAs(id: string, auth: ProviderAuth, modelIds: readonly string[]) {
    const core = createFauxCore({
        models: modelIds.map((modelId) => ({ id: modelId })),
        provider: id,
    });
    const provider = createProvider({
        api: { stream: core.stream, streamSimple: core.streamSimple },
        auth,
        id,
        models: core.models,
    });
    return { core, provider };
}

export const fauxConnection: RunnerModelConnection = {
    credential: { key: 'faux-key-0001', kind: 'api-key' },
    id: 'mc_faux',
    label: 'Faux',
    provider: 'xai',
    serverId: 'srv_1',
};

export async function agentDir() {
    const directory = await mkdtemp(join(tmpdir(), 'haus-pi-agent-'));
    cleanups.push(() => rm(directory, { force: true, recursive: true }));
    return directory;
}

export function launch(dir: string, tools: RunTools, modelId = 'faux-1') {
    return {
        agentDir: dir,
        agentId: 'agt_1',
        connection: fauxConnection,
        instructions: 'You are Blippy, a Haus Agent.\n',
        modelId,
        reasoningEffort: 'default' as const,
        tools,
    };
}

export async function collect(events: AsyncIterable<TurnEvent>) {
    const all: TurnEvent[] = [];
    for await (const event of events) {
        all.push(event);
    }
    return {
        reasoning: all
            .map((event) => (event.type === 'reasoning-delta' ? event.text : ''))
            .join(''),
        steps: all.flatMap<unknown>((event) => {
            switch (event.type) {
                case 'progress':
                case 'text-delta':
                case 'reasoning-delta':
                    return [];
                case 'reasoning-start':
                case 'reasoning-end':
                case 'step-finish':
                case 'abort':
                    return [event.type];
                case 'turn-finish':
                    return [{ type: event.type, usage: event.usage !== null }];
                default:
                    return [event];
            }
        }),
        text: all.map((event) => (event.type === 'text-delta' ? event.text : '')).join(''),
    };
}

export function roles(context: TranscriptContext) {
    return context.messages.map((message: Message) => message.role);
}
