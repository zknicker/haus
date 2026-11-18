import { expect, test } from 'bun:test';
import { buildAvatarGenerationPrompt } from '@haus/api';
import {
    AvatarGenerationBusyError,
    type AvatarGenerationLogEvent,
    AvatarGenerationProviderError,
    type AvatarImageProvider,
    AvatarImageService,
    type AvatarProviderRequest,
} from './service.ts';

const png = Uint8Array.from(
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
    )
);

test('generates one normalized avatar with the exact prompt and no reference input', async () => {
    const requests: AvatarProviderRequest[] = [];
    const logs: AvatarGenerationLogEvent[] = [];
    const provider: AvatarImageProvider = {
        available: true,
        generate: async (request) => {
            requests.push(request);
            return { bytes: png, mediaType: 'image/png' };
        },
    };
    const service = new AvatarImageService(provider, (event) => logs.push(event));
    const concept = 'a moonlit raccoon cartographer';

    const result = await service.generate({
        agentId: 'agt_avatar',
        concept,
        serverId: 'srv_avatar',
    });

    expect(requests).toEqual([
        {
            model: 'gpt-image-2',
            numberOfImages: 1,
            outputFormat: 'png',
            prompt: buildAvatarGenerationPrompt(concept),
        },
    ]);
    expect(result).toMatchObject({
        height: 256,
        mediaType: 'image/png',
        width: 256,
    });
    expect(result.byteSize).toBe(result.bytes.byteLength);
    expect(logs[0]).toMatchObject({
        actorAgentId: 'agt_avatar',
        model: 'gpt-image-2',
        outcome: 'success',
        serverId: 'srv_avatar',
    });
    expect(JSON.stringify(logs)).not.toContain(concept);
    expect(JSON.stringify(logs)).not.toContain(Buffer.from(png).toString('base64'));
});

test('maps provider failures without logging provider details or releasing the error as raw text', async () => {
    const concept = 'a secret lighthouse keeper';
    const logs: AvatarGenerationLogEvent[] = [];
    const service = new AvatarImageService(
        {
            available: true,
            generate: async () => {
                throw new Error(`provider failed for ${concept}`);
            },
        },
        (event) => logs.push(event)
    );

    await expect(
        service.generate({ agentId: 'agt_failure', concept, serverId: 'srv_failure' })
    ).rejects.toBeInstanceOf(AvatarGenerationProviderError);
    expect(JSON.stringify(logs)).not.toContain(concept);
    expect(JSON.stringify(logs)).not.toContain('provider failed');
    expect(logs[0]).toMatchObject({ outcome: 'provider_failed' });
});

test('allows two Server-wide generations, one per Agent, and releases capacity after failure', async () => {
    let calls = 0;
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    let firstStarted!: () => void;
    let secondStarted!: () => void;
    const firstReady = new Promise<void>((resolve) => {
        firstStarted = resolve;
    });
    const secondReady = new Promise<void>((resolve) => {
        secondStarted = resolve;
    });
    const provider: AvatarImageProvider = {
        available: true,
        generate: async () => {
            calls += 1;
            if (calls === 1) {
                firstStarted();
                await new Promise<void>((resolve) => {
                    releaseFirst = resolve;
                });
                throw new Error('first failed');
            }
            if (calls === 2) {
                secondStarted();
                await new Promise<void>((resolve) => {
                    releaseSecond = resolve;
                });
            }
            return { bytes: png, mediaType: 'image/png' };
        },
    };
    const service = new AvatarImageService(provider);
    const first = service.generate({ agentId: 'agt_one', concept: 'one', serverId: 'srv' });
    await firstReady;
    await expect(
        service.generate({ agentId: 'agt_one', concept: 'same actor', serverId: 'srv' })
    ).rejects.toBeInstanceOf(AvatarGenerationBusyError);

    const second = service.generate({ agentId: 'agt_two', concept: 'two', serverId: 'srv' });
    await secondReady;
    await expect(
        service.generate({ agentId: 'agt_three', concept: 'three', serverId: 'srv' })
    ).rejects.toBeInstanceOf(AvatarGenerationBusyError);

    releaseFirst();
    releaseSecond();
    await expect(first).rejects.toBeInstanceOf(AvatarGenerationProviderError);
    await expect(second).resolves.toMatchObject({ width: 256, height: 256 });
    await expect(
        service.generate({ agentId: 'agt_one', concept: 'retry', serverId: 'srv' })
    ).resolves.toMatchObject({ width: 256, height: 256 });
});
