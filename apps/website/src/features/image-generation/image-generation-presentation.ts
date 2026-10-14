import type { ImageGeneration, ImageGenerationCost } from '@haus/api';

/** `$0.11`, or `~$0.11` while the figure is the registry estimate rather than provider usage. */
export function formatImageGenerationCost(cost: ImageGenerationCost): string {
    const amount = formatUsd(cost.usd);
    return cost.basis === 'estimate' ? `~${amount}` : amount;
}

/** Cents once a render costs a dime; sub-dime prices keep the third digit that tells models apart. */
function formatUsd(usd: number): string {
    if (usd >= 0.1) {
        return `$${usd.toFixed(2)}`;
    }
    if (usd > 0 && usd < 0.001) {
        return '<$0.001';
    }
    const fixed = usd.toFixed(3);
    return `$${fixed.endsWith('0') ? fixed.slice(0, -1) : fixed}`;
}

/** `12s`, `1m 05s`. */
export function formatElapsed(ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) {
        return `${seconds}s`;
    }
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/**
 * The card footer's two lines. Line one is always the full model name; line
 * two is `status · facts`, where the status word is shown only while the
 * generation is live or has failed.
 */
export interface ImageGenerationFooter {
    readonly facts: string;
    readonly live: boolean;
    readonly model: string;
    readonly status: 'failed' | 'generating' | null;
    readonly tone: 'danger' | 'default';
}

export function imageGenerationFooter(
    generation: ImageGeneration,
    nowMs: number
): ImageGenerationFooter {
    const model = generation.modelDisplayName;
    const { result } = generation;
    switch (result.state) {
        case 'pending':
        case 'generating':
            return {
                facts: formatElapsed(nowMs - Date.parse(generation.createdAt)),
                live: true,
                model,
                status: 'generating',
                tone: 'default',
            };
        case 'ready':
            return {
                facts: `${result.resolution} · ${formatImageGenerationCost(result.cost)}`,
                live: false,
                model,
                status: null,
                tone: 'default',
            };
        case 'failed':
            return {
                facts: result.cost ? formatImageGenerationCost(result.cost) : 'no charge',
                live: false,
                model,
                status: 'failed',
                tone: 'danger',
            };
        default:
            return assertNever(result);
    }
}

/** Width over height. Ready renders use the rendered pixels; every other state the requested ratio. */
export function imageGenerationAspect(generation: ImageGeneration): number {
    const { result, request } = generation;
    return result.state === 'ready'
        ? result.width / result.height
        : request.aspectRatio.width / request.aspectRatio.height;
}

/** The save-as name: the generation id plus the extension the bytes carry. */
export function imageGenerationFilename(generation: ImageGeneration, mediaType?: string): string {
    const subtype = mediaType?.split(';')[0]?.split('/')[1]?.trim();
    const extension =
        subtype === 'jpeg' ? 'jpg' : subtype && /^[a-z0-9]{2,5}$/u.test(subtype) ? subtype : 'png';
    return `${generation.id}.${extension}`;
}

/** Words for the viewer's accessible name: model plus the one fact a screen reader needs. */
export function imageGenerationLabel(generation: ImageGeneration): string {
    const { state } = generation.result;
    if (state === 'failed') {
        return `Image generation failed: ${generation.modelDisplayName}`;
    }
    return state === 'ready'
        ? `Generated image: ${generation.modelDisplayName}`
        : `Generating image: ${generation.modelDisplayName}`;
}

function assertNever(value: never): never {
    throw new Error(`Unhandled image generation state: ${JSON.stringify(value)}`);
}
