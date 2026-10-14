import type {
    agentImageGenerationCreateInputSchema,
    ImageGenerationModel,
    ImageGenerationRequest,
    ImageGenerationResolution,
    ImageGenerationSize,
} from '@haus/api';
import type * as z from 'zod';
import { ImageGenerationRequestError } from './image-generation-errors.ts';
import { findImageGenerationModel, imageGenerationRegistry } from './image-generation-registry.ts';
import {
    checkExactPixelSize,
    exactSizeForAspect,
    nearestAspects,
    nominalLongEdgeOf,
    parseAspect,
    reduceRatio,
} from './image-generation-sizing.ts';

type CreateInput = z.output<typeof agentImageGenerationCreateInputSchema>;

const defaultSize: ImageGenerationSize = { height: 1024, width: 1024 };
const defaultAspect = '1:1';
const defaultResolution: ImageGenerationResolution = '1K';

export interface ResolvedImageGenerationRequest {
    model: ImageGenerationModel;
    request: ImageGenerationRequest;
}

/**
 * Checks a create request against the registry before any provider call and
 * derives what the record stores. A request the model cannot render exactly
 * fails naming the nearest supported option; nothing is coerced. Omitted size
 * options take a plain default (a 1024x1024 or 1:1 at 1K render) that the
 * record then states.
 */
export function resolveImageGenerationRequest(input: CreateInput): ResolvedImageGenerationRequest {
    const model = findImageGenerationModel(input.model);
    if (!model) {
        throw new ImageGenerationRequestError(
            `${input.model} is not an image model. Use one of: ${imageGenerationRegistry.map(({ id }) => id).join(', ')}.`
        );
    }
    requireReferenceLimit(model, input.referenceAttachmentIds.length);
    requireBackground(model, input.background);
    requireQuality(model, input.quality);
    const sizing = resolveSizing(model, input);
    return {
        model,
        request: {
            aspect: sizing.aspect,
            aspectRatio: sizing.aspectRatio,
            background: input.background,
            quality: input.quality,
            referenceAttachmentIds: input.referenceAttachmentIds,
            resolution: sizing.resolution,
            size: sizing.size,
        },
    };
}

type Sizing = Pick<ImageGenerationRequest, 'aspect' | 'aspectRatio' | 'resolution' | 'size'>;

function resolveSizing(model: ImageGenerationModel, input: CreateInput): Sizing {
    if (model.sizing.kind === 'exact-pixels') {
        const { sizing } = model;
        if (input.size) {
            return exactPixelsSizing(
                input.size,
                null,
                null,
                checkExactPixelSize(input.size, sizing)
            );
        }
        if (!(input.aspect || input.resolution)) {
            return exactPixelsSizing(defaultSize, null, null, null);
        }
        const aspect = parseAspect(input.aspect ?? defaultAspect);
        const resolution = input.resolution ?? defaultResolution;
        return exactPixelsSizing(
            exactSizeForAspect(aspect, resolution, sizing),
            input.aspect ?? defaultAspect,
            resolution,
            null
        );
    }
    return aspectResolutionSizing(model, model.sizing, input);
}

function exactPixelsSizing(
    size: ImageGenerationSize,
    aspect: string | null,
    resolution: ImageGenerationResolution | null,
    failure: string | null
): Sizing {
    if (failure) {
        throw new ImageGenerationRequestError(failure);
    }
    return { aspect, aspectRatio: reduceRatio(size), resolution, size };
}

function aspectResolutionSizing(
    model: ImageGenerationModel,
    sizing: Extract<ImageGenerationModel['sizing'], { kind: 'aspect-resolution' }>,
    input: CreateInput
): Sizing {
    const supported = (aspect: string) => sizing.aspects.includes(aspect);
    const aspect = input.aspect ?? defaultAspect;
    const resolution = input.resolution ?? defaultResolution;
    if (input.size) {
        // The provider takes an aspect and a class, so a pixel size would be coerced: refuse it.
        const nearest = nearestAspectResolution(input.size, sizing);
        throw new ImageGenerationRequestError(
            `${model.displayName} takes an aspect plus a resolution, not --size. ` +
                `Nearest to ${input.size.width}x${input.size.height}: --aspect ${nearest.aspect} --resolution ${nearest.resolution}.`
        );
    }
    if (!supported(aspect)) {
        throw new ImageGenerationRequestError(
            `The aspect ${aspect} is not supported by ${model.displayName}. ` +
                `Nearest supported aspects: ${nearestAspects(parseAspect(aspect), sizing.aspects).join(' or ')}. ` +
                `Supported: ${sizing.aspects.join(', ')}.`
        );
    }
    if (!sizing.resolutions.includes(resolution)) {
        throw new ImageGenerationRequestError(
            `${resolution} is not supported by ${model.displayName}. Use one of: ${sizing.resolutions.join(', ')}.`
        );
    }
    return {
        aspect,
        aspectRatio: reduceRatio(parseAspect(aspect)),
        resolution,
        size: input.size,
    };
}

function nearestAspectResolution(
    size: ImageGenerationSize,
    sizing: Extract<ImageGenerationModel['sizing'], { kind: 'aspect-resolution' }>
) {
    const [aspect] = nearestAspects(reduceRatio(size), sizing.aspects);
    const longEdge = Math.max(size.width, size.height);
    const [resolution] = [...sizing.resolutions].sort(
        (a, b) =>
            Math.abs(nominalLongEdgeOf(a) - longEdge) - Math.abs(nominalLongEdgeOf(b) - longEdge)
    );
    return { aspect, resolution };
}

function requireReferenceLimit(model: ImageGenerationModel, count: number) {
    if (count === 0 || count <= model.maxReferences) {
        return;
    }
    const takers = imageGenerationRegistry
        .filter(({ maxReferences }) => maxReferences > 0)
        .map(({ id }) => id);
    throw new ImageGenerationRequestError(
        model.maxReferences === 0
            ? `${model.displayName} takes no reference images. Models that do: ${takers.join(', ')}.`
            : `${model.displayName} takes at most ${model.maxReferences} reference images; this request has ${count}.`
    );
}

function requireBackground(model: ImageGenerationModel, background: CreateInput['background']) {
    if (background === 'transparent' && !model.supportsTransparency) {
        const takers = imageGenerationRegistry
            .filter(({ supportsTransparency }) => supportsTransparency)
            .map(({ id }) => id);
        throw new ImageGenerationRequestError(
            `${model.displayName} cannot render a transparent background. Models that can: ${takers.join(', ')}.`
        );
    }
}

function requireQuality(model: ImageGenerationModel, quality: string | null) {
    if (quality === null) {
        return;
    }
    if (model.qualityLevels.length === 0) {
        throw new ImageGenerationRequestError(
            `${model.displayName} has no quality levels; omit --quality.`
        );
    }
    if (!model.qualityLevels.includes(quality)) {
        throw new ImageGenerationRequestError(
            `Quality ${quality} is not supported by ${model.displayName}. Use one of: ${model.qualityLevels.join(', ')}.`
        );
    }
}
