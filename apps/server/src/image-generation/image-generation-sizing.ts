import type {
    ImageGenerationModel,
    ImageGenerationRequest,
    ImageGenerationResolution,
    ImageGenerationSize,
    ImageGenerationSizing,
} from '@haus/api';
import { ImageGenerationRequestError } from './image-generation-errors.ts';

type ExactPixels = Extract<ImageGenerationSizing, { kind: 'exact-pixels' }>;

/** OpenAI's total-pixel bounds for GPT Image 2.5 renders (width x height). */
const openAiMinPixels = 655_360;
const openAiMaxPixels = 8_294_400;

/** The long edge each resolution class asks for, on every model that takes a resolution. */
const nominalLongEdge: Record<ImageGenerationResolution, number> = {
    '1K': 1024,
    '2K': 2048,
    '4K': 3840,
};

export function nominalLongEdgeOf(resolution: ImageGenerationResolution): number {
    return nominalLongEdge[resolution];
}

/**
 * The resolution class of a rendered image, from its long edge. The thresholds
 * sit above the provider's wide renders (Gemini 16:9 at 1K is 1376 wide, at 2K
 * 2752) so a class never reads one step high.
 */
export function resolutionClassOf(size: ImageGenerationSize): ImageGenerationResolution {
    const longEdge = Math.max(size.width, size.height);
    if (longEdge <= 1536) {
        return '1K';
    }
    return longEdge <= 3072 ? '2K' : '4K';
}

/**
 * The class a finished render is recorded and priced under. Aspect plus
 * resolution models (Gemini) render to the class that was asked for, whatever
 * the aspect makes the long edge (21:9 at 1K is 1584x672); exact-pixel models
 * (OpenAI) class by the rendered long edge.
 */
export function renderedResolutionClass(
    model: Pick<ImageGenerationModel, 'sizing'>,
    request: Pick<ImageGenerationRequest, 'resolution'>,
    size: ImageGenerationSize
): ImageGenerationResolution {
    if (model.sizing.kind === 'aspect-resolution' && request.resolution) {
        return request.resolution;
    }
    return resolutionClassOf(size);
}

export function parseAspect(aspect: string): { height: number; width: number } {
    const [width, height] = aspect.split(':').map(Number);
    if (!(width && height && Number.isInteger(width) && Number.isInteger(height))) {
        throw new ImageGenerationRequestError(`The aspect ${aspect} must read W:H, like 16:9.`);
    }
    return { height, width };
}

export function reduceRatio(size: { height: number; width: number }) {
    const divisor = gcd(size.width, size.height);
    return { height: size.height / divisor, width: size.width / divisor };
}

/** The (up to) two supported aspects closest to the requested ratio. */
export function nearestAspects(aspect: { height: number; width: number }, supported: string[]) {
    const target = Math.log(aspect.width / aspect.height);
    return supported
        .map((candidate) => {
            const parsed = parseAspect(candidate);
            return {
                candidate,
                distance: Math.abs(Math.log(parsed.width / parsed.height) - target),
            };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 2)
        .map(({ candidate }) => candidate);
}

/** Why an exact-pixel size is not renderable, with the nearest renderable one; null when it is. */
export function checkExactPixelSize(size: ImageGenerationSize, sizing: ExactPixels): string | null {
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    const reasons: string[] = [];
    if (size.width % sizing.multipleOf !== 0 || size.height % sizing.multipleOf !== 0) {
        reasons.push(`both edges must be multiples of ${sizing.multipleOf}`);
    }
    if (long > sizing.maxEdge) {
        reasons.push(`the longest edge is at most ${sizing.maxEdge}`);
    }
    if (long / short > sizing.maxRatio) {
        reasons.push(`the long:short ratio is at most ${sizing.maxRatio}:1`);
    }
    const pixels = size.width * size.height;
    if (pixels < openAiMinPixels || pixels > openAiMaxPixels) {
        reasons.push(
            `total pixels must be between ${openAiMinPixels.toLocaleString('en-US')} and ${openAiMaxPixels.toLocaleString('en-US')}`
        );
    }
    if (reasons.length === 0) {
        return null;
    }
    const nearest = nearestExactPixelSize(size, sizing);
    return `${size.width}x${size.height} is not renderable: ${reasons.join(', ')}. Nearest supported size: ${nearest.width}x${nearest.height}.`;
}

export function nearestExactPixelSize(size: ImageGenerationSize, sizing: ExactPixels) {
    let { height, width } = size;
    const long = Math.max(width, height);
    if (long > sizing.maxEdge) {
        const scale = sizing.maxEdge / long;
        width *= scale;
        height *= scale;
    }
    const clampedLong = Math.max(width, height);
    if (clampedLong / Math.min(width, height) > sizing.maxRatio) {
        if (width >= height) {
            height = width / sizing.maxRatio;
        } else {
            width = height / sizing.maxRatio;
        }
    }
    const pixels = width * height;
    if (pixels > openAiMaxPixels || pixels < openAiMinPixels) {
        const scale = Math.sqrt(
            (pixels > openAiMaxPixels ? openAiMaxPixels : openAiMinPixels) / pixels
        );
        width *= scale;
        height *= scale;
    }
    const snap = (edge: number) =>
        Math.min(
            Math.floor(sizing.maxEdge / sizing.multipleOf) * sizing.multipleOf,
            Math.max(sizing.multipleOf, Math.round(edge / sizing.multipleOf) * sizing.multipleOf)
        );
    const snapped = { height: snap(height), width: snap(width) };
    // Snapping can land a hair outside the pixel bounds; step the long edge back inside.
    const stepKey = snapped.width >= snapped.height ? 'width' : 'height';
    while (
        snapped.width * snapped.height > openAiMaxPixels &&
        snapped[stepKey] > sizing.multipleOf
    ) {
        snapped[stepKey] -= sizing.multipleOf;
    }
    while (
        snapped.width * snapped.height < openAiMinPixels &&
        snapped[stepKey] + sizing.multipleOf <= sizing.maxEdge
    ) {
        snapped[stepKey] += sizing.multipleOf;
    }
    return snapped;
}

/**
 * Maps aspect plus resolution to exact pixels, only when the mapping is exact:
 * the long edge is the resolution's nominal edge and the short edge lands on a
 * multiple. Otherwise fails with the nearest renderable size.
 */
export function exactSizeForAspect(
    aspect: { height: number; width: number },
    resolution: ImageGenerationResolution,
    sizing: ExactPixels
): ImageGenerationSize {
    const longEdge = nominalLongEdge[resolution];
    const shortEdge =
        (longEdge * Math.min(aspect.width, aspect.height)) / Math.max(aspect.width, aspect.height);
    const size =
        aspect.width >= aspect.height
            ? { height: shortEdge, width: longEdge }
            : { height: longEdge, width: shortEdge };
    if (Number.isInteger(shortEdge) && checkExactPixelSize(size, sizing) === null) {
        return size;
    }
    const nearest = nearestExactPixelSize(
        { height: Math.round(size.height), width: Math.round(size.width) },
        sizing
    );
    throw new ImageGenerationRequestError(
        `${aspect.width}:${aspect.height} at ${resolution} is not an exact size on this model. ` +
            `Nearest supported size: ${nearest.width}x${nearest.height}; pass it as --size.`
    );
}

function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
}
