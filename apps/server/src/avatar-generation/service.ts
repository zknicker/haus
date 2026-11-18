import { randomUUID } from 'node:crypto';
import {
    avatarGenerationModel,
    avatarGenerationOutputFormat,
    avatarGenerationRequestSchema,
    buildAvatarGenerationPrompt,
} from '@haus/api';
import {
    AvatarGenerationBusyError,
    AvatarGenerationProviderError,
    AvatarGenerationUnavailableError,
    AvatarImageOutputError,
    AvatarProviderError,
} from './errors.ts';
import {
    type NormalizedAvatarImage,
    normalizeGeneratedAvatar,
    type ProviderAvatarImage,
} from './normalization.ts';

export type {
    AvatarGenerationLogEvent,
    AvatarGenerationLogger,
    AvatarImageProvider,
    AvatarProviderRequest,
} from './types.ts';

import type {
    AvatarGenerationLogEvent,
    AvatarGenerationLogger,
    AvatarImageProvider,
    AvatarProviderRequest,
} from './types.ts';

export {
    AvatarGenerationBusyError,
    AvatarImageOutputError,
    AvatarGenerationProviderError,
    AvatarGenerationUnavailableError,
    AvatarProviderError,
};

export interface AvatarGenerationInput {
    agentId: string;
    concept: string;
    serverId: string;
}

export class AvatarImageService {
    private readonly inFlight = new AvatarGenerationLimiter(2);

    constructor(
        private readonly provider: AvatarImageProvider,
        private readonly logger: AvatarGenerationLogger = defaultLogger
    ) {}

    /** Whether generation can succeed at all on this Server. */
    get available(): boolean {
        return this.provider.available;
    }

    async generate(input: AvatarGenerationInput): Promise<NormalizedAvatarImage> {
        const request = avatarGenerationRequestSchema.parse({ concept: input.concept });
        const requestId = `img_${randomUUID().replaceAll('-', '')}`;
        const startedAt = Date.now();
        const actorKey = `${input.serverId}:${input.agentId}`;

        if (!this.inFlight.tryAcquire(actorKey)) {
            this.log({
                actorAgentId: input.agentId,
                model: avatarGenerationModel,
                outcome: 'busy',
                requestId,
                serverId: input.serverId,
                durationMs: 0,
            });
            throw new AvatarGenerationBusyError();
        }

        try {
            const providerRequest: AvatarProviderRequest = {
                model: avatarGenerationModel,
                numberOfImages: 1,
                outputFormat: avatarGenerationOutputFormat,
                prompt: buildAvatarGenerationPrompt(request.concept),
            };
            let providerImage: ProviderAvatarImage;
            try {
                providerImage = await this.provider.generate(providerRequest);
            } catch (cause) {
                if (cause instanceof AvatarGenerationUnavailableError) {
                    this.logFailure(input, requestId, startedAt, 'unavailable');
                    throw cause;
                }
                this.logFailure(input, requestId, startedAt, 'provider_failed');
                throw new AvatarGenerationProviderError();
            }

            let normalized: NormalizedAvatarImage;
            try {
                normalized = normalizeGeneratedAvatar(providerImage);
            } catch {
                this.logFailure(input, requestId, startedAt, 'output_invalid');
                throw new AvatarImageOutputError();
            }

            this.log({
                actorAgentId: input.agentId,
                byteSize: normalized.byteSize,
                height: normalized.height,
                mediaType: normalized.mediaType,
                model: avatarGenerationModel,
                outcome: 'success',
                requestId,
                serverId: input.serverId,
                durationMs: Date.now() - startedAt,
                width: normalized.width,
            });
            return normalized;
        } finally {
            this.inFlight.release(actorKey);
        }
    }

    private logFailure(
        input: AvatarGenerationInput,
        requestId: string,
        startedAt: number,
        outcome: Extract<
            AvatarGenerationLogEvent['outcome'],
            'output_invalid' | 'provider_failed' | 'unavailable'
        >
    ) {
        this.log({
            actorAgentId: input.agentId,
            model: avatarGenerationModel,
            outcome,
            requestId,
            serverId: input.serverId,
            durationMs: Date.now() - startedAt,
        });
    }

    private log(event: AvatarGenerationLogEvent) {
        this.logger(event);
    }
}

class AvatarGenerationLimiter {
    private readonly actors = new Set<string>();
    private globalCount = 0;

    constructor(private readonly globalLimit: number) {}

    tryAcquire(actorKey: string): boolean {
        if (this.actors.has(actorKey) || this.globalCount >= this.globalLimit) {
            return false;
        }
        this.actors.add(actorKey);
        this.globalCount += 1;
        return true;
    }

    release(actorKey: string): void {
        if (!this.actors.delete(actorKey)) {
            return;
        }
        this.globalCount -= 1;
    }
}

function defaultLogger(event: AvatarGenerationLogEvent): void {
    console.info('[haus] avatar generation', event);
}
