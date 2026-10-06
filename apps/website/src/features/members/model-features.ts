import type { ComputerModelFeature } from '@haus/api';

const featureLabels: Record<ComputerModelFeature, string> = {
    'image-generation': 'Image generation',
    subagents: 'Sub-agents',
};

/** Codex image generation runs only on paid ChatGPT plans and drops silently on the rest. */
const codexImageGenerationLabel = 'Image generation (ChatGPT paid plans)';

/** The core features an Agent gets on a model, as the reporting Computer launches its runtime. */
export function modelFeatureLabels(
    runtimeId: string,
    features: readonly ComputerModelFeature[] = []
): string[] {
    return features.map((feature) =>
        runtimeId === 'codex' && feature === 'image-generation'
            ? codexImageGenerationLabel
            : featureLabels[feature]
    );
}

/** One picker line for a model's features, or nothing when it reports none. */
export function modelFeatureDescription(
    runtimeId: string,
    features: readonly ComputerModelFeature[] = []
): string | undefined {
    return modelFeatureLabels(runtimeId, features).join(' · ') || undefined;
}
