import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import {
    imageGenerationAspectSchema,
    imageGenerationBackgroundSchema,
    imageGenerationModelIdSchema,
    imageGenerationModelStatusSchema,
    imageGenerationProviderSchema,
    imageGenerationResolutionSchema,
    imageGenerationSizeSchema,
} from './image-generation-models.ts';
import { formatImageGenerationReferenceTarget } from './rich-references.ts';

export const imageGenerationPromptMaxLength = 8000;
export const imageGenerationMaxReferences = 16;

/** The label a generated image's link carries; the card renders from the record, not the label. */
export const imageGenerationLinkLabel = 'Generated image';

/** The one way to write an image generation link: `[Generated image](image-generation://<id>)`. */
export function formatImageGenerationLink(generationId: string): string {
    return `[${imageGenerationLinkLabel}](${formatImageGenerationReferenceTarget(generationId)})`;
}

export const imageGenerationCostSchema = z
    .object({
        /** `usage`: computed from provider-reported usage. `estimate`: the registry price table. */
        basis: z.enum(['usage', 'estimate']),
        usd: z.number().nonnegative(),
    })
    .strict();
export type ImageGenerationCost = z.infer<typeof imageGenerationCostSchema>;

/** What was asked for. Every state carries it, so a pending or failed card can size itself. */
export const imageGenerationRequestSchema = z
    .object({
        /** The requested aspect as a ratio, derived from `size` or `aspect`; card sizing reads only this. */
        aspectRatio: z
            .object({
                height: z.number().int().positive(),
                width: z.number().int().positive(),
            })
            .strict(),
        aspect: imageGenerationAspectSchema.nullable(),
        background: imageGenerationBackgroundSchema,
        quality: z.string().trim().min(1).max(40).nullable(),
        referenceAttachmentIds: z.array(idSchema).max(16),
        resolution: imageGenerationResolutionSchema.nullable(),
        size: imageGenerationSizeSchema.nullable(),
    })
    .strict();
export type ImageGenerationRequest = z.infer<typeof imageGenerationRequestSchema>;

/** `pending → generating → ready | failed`. */
export const imageGenerationResultSchema = z.discriminatedUnion('state', [
    z.object({ state: z.literal('pending') }).strict(),
    z.object({ state: z.literal('generating') }).strict(),
    z
        .object({
            attachmentId: idSchema,
            cost: imageGenerationCostSchema,
            durationMs: z.number().int().nonnegative(),
            height: z.number().int().positive(),
            resolution: imageGenerationResolutionSchema,
            state: z.literal('ready'),
            width: z.number().int().positive(),
        })
        .strict(),
    z
        .object({
            /** A provider-billed failure records its cost; otherwise null. */
            cost: imageGenerationCostSchema.nullable(),
            durationMs: z.number().int().nonnegative().nullable(),
            errorCode: z.string().trim().min(1).max(120),
            reason: z.string().trim().min(1).max(1000),
            state: z.literal('failed'),
        })
        .strict(),
]);
export type ImageGenerationResult = z.infer<typeof imageGenerationResultSchema>;
export type ImageGenerationState = ImageGenerationResult['state'];

/** One durable image generation: one image, owned by the requesting Agent, linked from Messages. */
export const imageGenerationSchema = z
    .object({
        agentId: idSchema,
        computerId: idSchema,
        createdAt: timestampSchema,
        /** `img_…` */
        id: idSchema,
        /** Registry id at request time. */
        model: imageGenerationModelIdSchema,
        /** Registry display name at request time. */
        modelDisplayName: z.string().trim().min(1).max(80),
        prompt: z.string().min(1).max(imageGenerationPromptMaxLength),
        provider: imageGenerationProviderSchema,
        request: imageGenerationRequestSchema,
        result: imageGenerationResultSchema,
        updatedAt: timestampSchema,
    })
    .strict();
export type ImageGeneration = z.infer<typeof imageGenerationSchema>;

/**
 * `imageGeneration.onUpdated`: a generation was created, changed state, or was
 * newly linked. One event per linking Message in a live Chat (ADR 0044
 * pattern), Chat access scoped. Ids only: the App invalidates that Message
 * (`chat.message`).
 */
export const imageGenerationUpdatedEventSchema = z
    .object({
        chatId: idSchema,
        generationId: idSchema,
        messageId: idSchema,
        parentChatId: idSchema.nullable(),
        serverId: idSchema,
    })
    .strict();
export type ImageGenerationUpdatedEvent = z.infer<typeof imageGenerationUpdatedEventSchema>;

/** `haus image models` — the Agent-scoped registry read. */
export const agentImageGenerationModelsReceiptSchema = z
    .object({ models: z.array(imageGenerationModelStatusSchema) })
    .strict();
export type AgentImageGenerationModelsReceipt = z.infer<
    typeof agentImageGenerationModelsReceiptSchema
>;

/**
 * `haus image generate` — the creation request the Computer forwards
 * (`POST /api/agent/image-generation`). The prompt travels with it; references
 * are attachment ids (the Computer uploads workspace paths first). A size is
 * either exact pixels or aspect plus resolution; the Server fails a request
 * the model cannot render exactly and names the nearest supported option.
 */
export const agentImageGenerationCreateInputSchema = z
    .object({
        aspect: imageGenerationAspectSchema.nullable().default(null),
        background: imageGenerationBackgroundSchema.default('opaque'),
        model: imageGenerationModelIdSchema,
        nonce: z.string().trim().min(1).max(128),
        prompt: z.string().trim().min(1).max(imageGenerationPromptMaxLength),
        quality: z.string().trim().min(1).max(40).nullable().default(null),
        referenceAttachmentIds: z.array(idSchema).max(imageGenerationMaxReferences).default([]),
        resolution: imageGenerationResolutionSchema.nullable().default(null),
        size: imageGenerationSizeSchema.nullable().default(null),
    })
    .strict()
    .refine((value) => !(value.size && (value.aspect || value.resolution)), {
        message: 'Give either an exact size or an aspect and resolution, not both.',
        path: ['size'],
    });
export type AgentImageGenerationCreateInput = z.input<typeof agentImageGenerationCreateInputSchema>;

/** The record exists and generation is queued; the CLI prints `link` at once, then polls. */
export const agentImageGenerationCreateReceiptSchema = z
    .object({
        generation: imageGenerationSchema,
        idempotent: z.boolean(),
        /** `[Generated image](image-generation://<id>)`, ready to paste into `haus message send`. */
        link: z.string().min(1),
    })
    .strict();
export type AgentImageGenerationCreateReceipt = z.infer<
    typeof agentImageGenerationCreateReceiptSchema
>;

/** `GET /api/agent/image-generation?generationId=` — the CLI's poll until `ready` or `failed`. */
export const agentImageGenerationGetInputSchema = z.object({ generationId: idSchema }).strict();
export const agentImageGenerationGetReceiptSchema = z
    .object({ generation: imageGenerationSchema })
    .strict();
export type AgentImageGenerationGetReceipt = z.infer<typeof agentImageGenerationGetReceiptSchema>;
