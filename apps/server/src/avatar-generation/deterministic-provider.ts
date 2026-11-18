import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AvatarImageProvider, AvatarProviderRequest } from './types.ts';

/**
 * A local-only provider for the opt-in Agent E2E recipe scenario. It returns
 * stable PNG bytes and records request boundaries without recording concepts.
 */
export class DeterministicAvatarImageProvider implements AvatarImageProvider {
    readonly available = true;
    private requestCount = 0;

    constructor(
        private readonly fixturePath: string,
        private readonly requestLogPath?: string
    ) {}

    async generate(request: AvatarProviderRequest) {
        this.requestCount += 1;
        if (this.requestLogPath) {
            await mkdir(dirname(this.requestLogPath), { recursive: true });
            await appendFile(
                this.requestLogPath,
                `${JSON.stringify({
                    count: this.requestCount,
                    model: request.model,
                    numberOfImages: request.numberOfImages,
                    outputFormat: request.outputFormat,
                })}\n`
            );
        }

        return {
            bytes: new Uint8Array(await Bun.file(this.fixturePath).arrayBuffer()),
            mediaType: 'image/png' as const,
        };
    }
}
