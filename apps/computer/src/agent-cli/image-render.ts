import type {
    ImageGeneration,
    ImageGenerationModelStatus,
    ImageGenerationPriceEstimate,
    ImageGenerationProvider,
} from '@haus/api';

export function imageNotPostedSentence(generationId: string): string {
    return `Nothing was posted. Include this Link line in a haus message send now; the card shows progress and updates when the image is ready. Run haus image wait ${generationId} when you need the file.`;
}

const providerNames: Record<ImageGenerationProvider, string> = {
    gemini: 'Gemini',
    openai: 'OpenAI',
};

/** The receipt `haus image generate` prints once the record exists; it does not wait. */
export function renderImageGenerationCreated(input: {
    generation: ImageGeneration;
    idempotent: boolean;
    link: string;
}): string {
    const { generation } = input;
    const lines = [
        `${input.idempotent ? 'Image generation already requested' : 'Image generation started'} with ${generation.modelDisplayName}. Generation ID: ${generation.id}`,
        `Link: ${input.link}`,
        imageNotPostedSentence(generation.id),
    ];
    return `${lines.join('\n')}\n`;
}

/** The result `haus image wait` prints once a generation is ready and its file is saved. */
export function renderImageGenerationReady(input: {
    generation: ImageGeneration;
    workspacePath: string;
}): string {
    const { generation } = input;
    const { result } = generation;
    if (result.state !== 'ready') {
        throw new Error('A ready receipt needs a ready generation.');
    }
    const lines = [
        'State: ready',
        `Path: ${input.workspacePath}`,
        `Attachment ID: ${result.attachmentId}`,
        `Model: ${generation.modelDisplayName} (${generation.model})`,
        `Size: ${result.width}x${result.height} (${result.resolution})`,
        `Quality: ${generation.request.quality ?? 'default'}`,
        `Duration: ${(result.durationMs / 1000).toFixed(1)}s`,
        `Cost: ${formatCost(result.cost)}`,
    ];
    lines.push(
        'The linked card already shows this image. Do not attach or re-send it unless someone asks for the file.'
    );
    return `${lines.join('\n')}\n`;
}

export function formatCost(cost: { basis: 'estimate' | 'usage'; usd: number }): string {
    return `${formatUsd(cost.usd)} (${cost.basis})`;
}

/** `haus image models`: one block per curated model. */
export function renderImageModels(models: readonly ImageGenerationModelStatus[]): string {
    if (models.length === 0) {
        return 'No image models are configured on this Server.\n';
    }
    const blocks = models.map(renderModel);
    return `${blocks.join('\n\n')}\n\nPrices are registry estimates. Pick a model by its id: haus image generate --model <id>.\n`;
}

function renderModel(status: ImageGenerationModelStatus): string {
    const { model } = status;
    const heading = `${model.displayName} (${model.id})${model.isDefault ? ' [default]' : ''}`;
    const availability = status.available
        ? 'available'
        : `unavailable: ${unavailableReason(status)}`;
    const lines = [
        heading,
        `  Provider: ${providerNames[model.provider]}`,
        `  Availability: ${availability}`,
        `  Strengths: ${model.strengths}`,
        `  Sizing: ${renderSizing(model.sizing)}`,
        `  Quality: ${model.qualityLevels.length ? model.qualityLevels.join(', ') : 'no quality levels'}`,
        `  References: ${model.maxReferences > 0 ? `up to ${model.maxReferences}` : 'not supported'}`,
        `  Transparent background: ${model.supportsTransparency ? 'yes' : 'no'}`,
        `  Price estimate: ${model.priceEstimates.map(renderPrice).join('; ')}`,
    ];
    return lines.join('\n');
}

function renderSizing(sizing: ImageGenerationModelStatus['model']['sizing']): string {
    if (sizing.kind === 'aspect-resolution') {
        return `--aspect A:B with --resolution. Aspects: ${sizing.aspects.join(', ')}. Resolutions: ${sizing.resolutions.join(', ')}.`;
    }
    const experimental = sizing.experimentalAbovePixels
        ? ` Above ${sizing.experimentalAbovePixels.toLocaleString('en-US')} total pixels the provider calls the output experimental.`
        : '';
    return `--size WxH, exact pixels. Both edges multiples of ${sizing.multipleOf}, long:short ratio at most ${sizing.maxRatio}:1, longest edge at most ${sizing.maxEdge}.${experimental}`;
}

function renderPrice(estimate: ImageGenerationPriceEstimate): string {
    const label = [estimate.resolution, estimate.quality].filter(Boolean).join(' ');
    return `${label ? `${label} ` : ''}~${formatUsd(estimate.usd)}`;
}

function unavailableReason(status: ImageGenerationModelStatus): string {
    if (status.unavailableReason === 'no-key') {
        const provider = providerNames[status.model.provider];
        return `no key. The Server Owner adds ${provider === 'OpenAI' ? 'an' : 'a'} ${provider} key in Settings → Image generation.`;
    }
    return 'not available on this Server.';
}

/** `$0.05`, `$0.034`, `$0.24`: at least cents, at most thousandths. */
function formatUsd(usd: number): string {
    const fixed = usd.toFixed(3);
    return `$${fixed.endsWith('0') ? fixed.slice(0, -1) : fixed}`;
}
