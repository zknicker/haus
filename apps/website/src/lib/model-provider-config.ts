import { Atom02Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { IconSvgElement } from '@hugeicons/react';
import type { ModelProviderLogoSource } from '../components/badges/model-provider-logo.tsx';
import {
    configuredModelProviders,
    iconModelProviderPresets,
    logoModelProviderPresets,
    providerConfigAliasIds,
} from './model-provider-presets.ts';

export type ModelAccessId = 'anthropic' | 'claude' | 'codex' | 'kimi' | 'openai' | 'openrouter';

export interface ModelProviderConfig {
    accessDisplayName: string;
    accessId: ModelAccessId | null;
    color: string;
    configName: string;
    displayName: string;
    icon: IconSvgElement;
    logo?: ModelProviderLogoSource;
}

export interface ModelIdentityConfig {
    displayName: string;
    modelId: string;
    provider: ModelProviderConfig;
    ref: string;
}

const providerConfigByName = new Map<string, ModelProviderConfig>(
    configuredModelProviders.map((provider) => [provider.configName, provider] as const)
);
providerConfigByName.set('openai', getRequiredProviderConfig('openai-api'));

for (const [configName, displayName, color, icon] of iconModelProviderPresets) {
    providerConfigByName.set(
        configName,
        createIconProviderConfig(configName, displayName, color, icon)
    );
}

for (const [configName, displayName, color, logo] of logoModelProviderPresets) {
    providerConfigByName.set(
        configName,
        createLogoProviderConfig(configName, displayName, color, logo)
    );
}
providerConfigByName.set('github-copilot-acp', getRequiredProviderConfig('github-copilot'));
providerConfigByName.set('copilot', getRequiredProviderConfig('github-copilot'));

const providerConfigAliases = providerConfigAliasIds.map(({ aliases, providerId }) => ({
    aliases,
    provider: getRequiredProviderConfig(providerId),
}));

const providerConfigByAccessId = new Map<ModelAccessId, ModelProviderConfig>(
    configuredModelProviders.flatMap((provider) =>
        provider.accessId ? [[provider.accessId, provider] as const] : []
    )
);

export function getModelProviderConfig(providerId: string): ModelProviderConfig {
    const normalizedProviderId = normalizeProviderIdentifier(providerId);

    return (
        providerConfigByName.get(providerId) ??
        providerConfigByName.get(normalizedProviderId) ??
        getAliasedModelProviderConfig(providerId) ??
        createFallbackModelProvider(providerId)
    );
}

export function getModelProviderConfigFromAccessId(accessId: ModelAccessId): ModelProviderConfig {
    return providerConfigByAccessId.get(accessId) ?? createFallbackModelProvider(accessId);
}

export function getModelIdentityConfig(input: {
    fallbackName?: string | null;
    modelId: string;
    providerId: string;
}): ModelIdentityConfig {
    const provider = getModelProviderConfig(input.providerId);
    const fallbackName = normalizeFallbackModelName(input.fallbackName, provider.displayName);

    return {
        displayName: fallbackName ?? input.modelId,
        modelId: input.modelId,
        provider,
        ref: input.providerId ? `${input.providerId}/${input.modelId}` : input.modelId,
    };
}

export function getModelIdentityConfigFromRef(modelRef: string, fallbackName?: string | null) {
    const { modelId, providerId } = splitModelRef(modelRef);

    return getModelIdentityConfig({
        fallbackName,
        modelId,
        providerId,
    });
}

export function formatModelOptionLabel(input: {
    fallbackName?: string | null;
    modelId: string;
    providerId: string;
}) {
    const model = getModelIdentityConfig(input);

    return model.displayName;
}

function createFallbackModelProvider(providerId: string): ModelProviderConfig {
    const label = titleizeIdentifier(providerId);

    return {
        accessDisplayName: label,
        accessId: null,
        color: '#64748B',
        configName: providerId,
        displayName: label,
        icon: Atom02Icon,
    };
}

function getAliasedModelProviderConfig(providerId: string): ModelProviderConfig | null {
    const normalizedProviderId = normalizeProviderIdentifier(providerId);

    for (const { aliases, provider } of providerConfigAliases) {
        if (
            aliases.some((alias) => {
                const normalizedAlias = normalizeProviderIdentifier(alias);
                return (
                    normalizedProviderId === normalizedAlias ||
                    normalizedProviderId.startsWith(`${normalizedAlias}-`)
                );
            })
        ) {
            return provider;
        }
    }

    return null;
}

function createIconProviderConfig(
    configName: string,
    displayName: string,
    color: string,
    icon: IconSvgElement
): ModelProviderConfig {
    return {
        accessDisplayName: displayName,
        accessId: null,
        color,
        configName,
        displayName,
        icon,
    };
}

function createLogoProviderConfig(
    configName: string,
    displayName: string,
    color: string,
    logo: ModelProviderLogoSource
): ModelProviderConfig {
    return {
        accessDisplayName: displayName,
        accessId: null,
        color,
        configName,
        displayName,
        icon: Atom02Icon,
        logo,
    };
}

function getRequiredProviderConfig(providerId: string): ModelProviderConfig {
    const provider = providerConfigByName.get(providerId);
    if (!provider) {
        throw new Error(`Missing model provider config for ${providerId}.`);
    }
    return provider;
}

function normalizeFallbackModelName(
    fallbackName: string | null | undefined,
    providerDisplayName: string
) {
    const normalizedName = fallbackName?.trim();

    if (!normalizedName) {
        return null;
    }

    return normalizeText(normalizedName) === normalizeText(providerDisplayName)
        ? null
        : normalizedName;
}

function splitModelRef(value: string) {
    const separatorIndex = value.indexOf('/');

    if (separatorIndex < 0) {
        return {
            modelId: value.trim(),
            providerId: '',
        };
    }

    return {
        modelId: value.slice(separatorIndex + 1).trim(),
        providerId: value.slice(0, separatorIndex).trim(),
    };
}

function normalizeText(value: string) {
    return value.trim().toLowerCase();
}

function normalizeProviderIdentifier(value: string) {
    return normalizeText(value)
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '');
}

function titleizeIdentifier(value: string) {
    return value
        .trim()
        .split(/[-_/]+/g)
        .filter((segment) => segment.length > 0)
        .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
        .join(' ');
}
