import {
    type CloudAgentModel,
    type CloudAgentModelCatalog,
    type CloudAgentModelEffort,
    type CloudAgentModelFamily,
    cloudAgentModelSchema,
    cloudAgentModelsListed,
    cursorAutoModelId,
    cursorFastParamId,
} from '@haus/api';
import type { CloudAgentModelListing, CloudAgentModelParamValue } from './provider.ts';

/** Cursor spells one effort control three ways; the first one a model lists wins. */
const effortParamIds = new Set(['effort', 'reasoning', 'reasoning_effort']);

/**
 * Maps Cursor's catalog to Haus's. Keeps Cursor's order and the first valid
 * listing of each id, turns Cursor's own Auto entry into `autoAvailable`
 * rather than a model, cleans labels, derives a family, and keeps only the
 * effort and fast parameters with the default variant's value for each.
 * Context, thinking, and every other parameter keep Cursor's defaults, so Haus
 * never sends them.
 */
export function mapCloudAgentModelCatalog(
    listings: CloudAgentModelListing[]
): Omit<CloudAgentModelCatalog, 'refreshedAt'> {
    const seen = new Set<string>();
    const models: CloudAgentModel[] = [];
    for (const listing of listings) {
        if (listing.id === cursorAutoModelId || seen.has(listing.id)) {
            continue;
        }
        const model = modelOf(listing, models.length);
        // A malformed parameter costs that control, never the whole model.
        const parsed = [
            model,
            { ...model, effort: null },
            { ...model, fast: null },
            { ...model, effort: null, fast: null },
        ]
            .map((candidate) => cloudAgentModelSchema.safeParse(candidate))
            .find((result) => result.success);
        if (!parsed?.success) {
            continue;
        }
        seen.add(parsed.data.id);
        models.push(parsed.data);
        if (models.length === cloudAgentModelsListed) {
            break;
        }
    }
    return {
        autoAvailable: listings.some((listing) => listing.id === cursorAutoModelId),
        models,
    };
}

/** Strips zero-width characters and collapses the doubled spaces Cursor's labels carry. */
export function cleanCloudAgentModelLabel(label: string): string {
    return label.replace(/[​-‍⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
}

export function cloudAgentModelFamilyOf(id: string, displayName: string): CloudAgentModelFamily {
    const name = `${id} ${displayName}`.toLowerCase();
    if (name.includes('claude')) {
        return 'claude';
    }
    if (name.includes('gpt') || name.includes('codex')) {
        return 'gpt';
    }
    for (const family of ['gemini', 'grok', 'composer', 'glm', 'kimi'] as const) {
        if (name.includes(family)) {
            return family;
        }
    }
    return 'other';
}

function modelOf(listing: CloudAgentModelListing, order: number) {
    const displayName = cleanCloudAgentModelLabel(listing.displayName).slice(0, 200);
    const defaults = listing.variants?.find((variant) => variant.isDefault)?.params ?? [];
    return {
        description: cleanCloudAgentModelLabel(listing.description ?? '').slice(0, 500) || null,
        displayName,
        effort: effortOf(listing, defaults),
        family: cloudAgentModelFamilyOf(listing.id, displayName),
        fast: fastOf(listing, defaults),
        id: listing.id,
        order,
    };
}

function effortOf(
    listing: CloudAgentModelListing,
    defaults: CloudAgentModelParamValue[]
): CloudAgentModelEffort | null {
    const param = listing.parameters?.find((candidate) => effortParamIds.has(candidate.id));
    if (!param || param.values.length === 0) {
        return null;
    }
    const options = param.values.map((option) => ({
        displayName: cleanCloudAgentModelLabel(option.displayName ?? '') || option.value,
        value: option.value,
    }));
    const preferred = defaults.find((value) => value.id === param.id)?.value;
    return {
        defaultValue: options.some((option) => option.value === preferred)
            ? (preferred ?? null)
            : null,
        options,
        providerParamId: param.id,
    };
}

/** Fast is offered only as a real on/off choice. */
function fastOf(
    listing: CloudAgentModelListing,
    defaults: CloudAgentModelParamValue[]
): { defaultValue: boolean } | null {
    const values = new Set(
        listing.parameters
            ?.find((candidate) => candidate.id === cursorFastParamId)
            ?.values.map((option) => option.value)
    );
    if (!(values.has('true') && values.has('false'))) {
        return null;
    }
    return {
        defaultValue: defaults.find((value) => value.id === cursorFastParamId)?.value === 'true',
    };
}
