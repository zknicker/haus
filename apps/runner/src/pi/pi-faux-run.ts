import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Message, TranscriptContext } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { type FauxResponseStep, fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import type { RunTools } from '../run-context.ts';
import { cleanups } from '../runner-test-server.ts';
import type { TurnEvent } from '../turn/turn-event.ts';
import { createPiHarness } from './pi-driver.ts';

export function fauxHarness(responses: FauxResponseStep[]) {
    const faux = fauxProvider({ models: [{ id: 'faux-1', reasoning: true }, { id: 'gpt-faux' }] });
    faux.setResponses(responses);
    const models = createModels();
    models.setProvider(faux.provider);
    const harness = createPiHarness({ log: () => undefined, maxWarm: 2, models, webSearch: [] });
    cleanups.push(() => harness.close());
    return harness;
}

export async function agentDir() {
    const directory = await mkdtemp(join(tmpdir(), 'haus-pi-agent-'));
    cleanups.push(() => rm(directory, { force: true, recursive: true }));
    return directory;
}

export function launch(dir: string, tools: RunTools, modelId = 'faux-1') {
    return {
        agentDir: dir,
        agentId: 'agt_1',
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
