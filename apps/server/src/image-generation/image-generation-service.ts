import {
    type AgentImageGenerationCreateReceipt,
    type AgentImageGenerationModelsReceipt,
    type agentImageGenerationCreateInputSchema,
    formatImageGenerationLink,
    type ImageGeneration,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type * as z from 'zod';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { imageGenerationsTable } from '../postgres/schema.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { createImageGeneration } from './create-image-generation.ts';
import { ImageGenerationNotFoundError } from './image-generation-errors.ts';
import { readConnectedImageProviders } from './image-generation-keys.ts';
import { imageGenerationModelStatuses } from './image-generation-registry.ts';
import { toImageGeneration } from './image-generation-shape.ts';
import { imageGenerationVisibleSql } from './image-generation-visibility.ts';
import { GeminiImageAdapter } from './providers/gemini-image-adapter.ts';
import type { ImageProviderFetch } from './providers/image-provider.ts';
import { OpenAiImageAdapter } from './providers/openai-image-adapter.ts';
import {
    type ImageProviderAdapters,
    runImageGeneration,
    sweepPendingImageGenerations,
} from './run-image-generation.ts';

type CreateInput = z.output<typeof agentImageGenerationCreateInputSchema>;

/** Server image generation behind the Agent API: models, create, and poll. */
export class ImageGenerationService {
    private readonly adapters: ImageProviderAdapters;

    constructor(
        private readonly options: {
            adapters?: ImageProviderAdapters;
            db: HausDatabase;
            fetcher?: ImageProviderFetch;
            postCommitWork: ServerPostCommitWork;
            root: AttachmentRoot;
        }
    ) {
        this.adapters = options.adapters ?? {
            gemini: new GeminiImageAdapter(options.fetcher),
            openai: new OpenAiImageAdapter(options.fetcher),
        };
    }

    /** The registry with availability for the Agent's Server. */
    async models(runner: ResolvedRunner): Promise<AgentImageGenerationModelsReceipt> {
        const connected = await readConnectedImageProviders(this.options.db, runner.serverId);
        return { models: imageGenerationModelStatuses(new Set(connected.keys())) };
    }

    async create(
        runner: ResolvedRunner,
        input: CreateInput
    ): Promise<AgentImageGenerationCreateReceipt> {
        const { generation, idempotent } = await createImageGeneration(
            this.options.db,
            runner,
            input
        );
        if (!idempotent) {
            void this.options.postCommitWork.run('image-generation.run', async () => {
                try {
                    await runImageGeneration(this.runDependencies(), generation.id);
                } catch (cause) {
                    // The row is still pending; the sweep claims it.
                    console.error(`Image generation ${generation.id} dispatch failed.`, cause);
                    await this.sweepPending();
                }
            });
        }
        return { generation, idempotent, link: formatImageGenerationLink(generation.id) };
    }

    /** Runs every unclaimed pending generation; the durable queue drain. */
    sweepPending(): Promise<void> {
        return sweepPendingImageGenerations(this.runDependencies());
    }

    private runDependencies() {
        return { adapters: this.adapters, db: this.options.db, root: this.options.root };
    }

    /** One generation the Agent may see: its own, or one a Message it can read links. */
    async get(runner: ResolvedRunner, generationId: string): Promise<ImageGeneration> {
        const [row] = await this.options.db
            .select()
            .from(imageGenerationsTable)
            .where(
                and(
                    eq(imageGenerationsTable.serverId, runner.serverId),
                    eq(imageGenerationsTable.id, generationId),
                    imageGenerationVisibleSql(this.options.db, runner.serverId, {
                        agentId: runner.agentId,
                        kind: 'agent',
                    })
                )
            )
            .limit(1);
        if (!row) {
            throw new ImageGenerationNotFoundError(generationId);
        }
        return toImageGeneration(row);
    }
}
