import type {
    CloudAgentModel,
    CloudAgentModelFamily,
    CloudAgentModelSetting,
    CloudAgentSettings,
} from '@haus/api';
import { findCloudAgentModel } from '@haus/api';
import { type CloudAgentModelParamsView, cloudAgentModelParamsView } from './cloud-agent-params.ts';

/** Never a Cursor model id, so Auto cannot collide with a listed model. */
export const autoModelKey = 'haus:auto';

export interface CloudAgentModelOption {
    description: string | null;
    id: string;
    label: string;
    /** Lowercased label and id: search matches either. */
    searchText: string;
    /** The saved model the catalog no longer lists: shown, never pickable. */
    unavailable: boolean;
}

/** One ListBox section. The leading section (Auto) has no title. */
export interface CloudAgentModelSection {
    id: string;
    options: CloudAgentModelOption[];
    title: string | null;
}

/**
 * What the Model row shows for one settings read.
 *
 * - `auto`: nothing saved; Runs use Cursor's Auto, which picks a model for each Run.
 * - `model`: a listed model is saved.
 * - `unavailable`: a saved model the freshest catalog does not list, so
 *   launches fall back to Auto.
 *
 * `catalogMissing` is independent: no Computer has reported a catalog, so only
 * Auto can be chosen. `params` is set only for a listed saved model.
 */
export interface CloudAgentModelView {
    catalogMissing: boolean;
    options: CloudAgentModelOption[];
    params: CloudAgentModelParamsView | null;
    /** False only when there is nothing to pick between: Auto and no catalog. */
    pickable: boolean;
    refreshedAt: string | null;
    sections: CloudAgentModelSection[];
    selectedKey: string;
    selectedLabel: string;
    state: 'auto' | 'model' | 'unavailable';
}

export function cloudAgentModelView(settings: CloudAgentSettings): CloudAgentModelView {
    const catalog = settings.catalog;
    const state = modelState(settings);
    const saved = settings.model.kind === 'model' ? settings.model : null;
    const leading: CloudAgentModelOption[] =
        state === 'unavailable' && saved
            ? [autoOption, { ...optionOf(saved.id, saved.id, null), unavailable: true }]
            : [autoOption];
    const sections = [
        { id: 'auto', options: leading, title: null },
        ...familySections(catalog?.models ?? []),
    ];
    const options = sections.flatMap((section) => section.options);
    const selectedKey = saved?.id ?? autoModelKey;
    const savedModel = saved && state === 'model' ? findCloudAgentModel(saved.id, catalog) : null;

    return {
        catalogMissing: catalog === null,
        options,
        params: saved && savedModel ? cloudAgentModelParamsView(savedModel, saved.params) : null,
        pickable: options.length > 1,
        refreshedAt: catalog?.refreshedAt ?? null,
        sections,
        selectedKey,
        selectedLabel: options.find((option) => option.id === selectedKey)?.label ?? selectedKey,
        state,
    };
}

/**
 * The picker's key back to the contract's union; `null` for an unknown key.
 * A new model starts at its own defaults, so params reset to `{}`.
 */
export function modelSettingForKey(
    key: unknown,
    view: CloudAgentModelView
): CloudAgentModelSetting | null {
    if (key === autoModelKey) {
        return { kind: 'auto' };
    }
    const option = view.options.find((candidate) => candidate.id === key);
    return option && !option.unavailable ? { id: option.id, kind: 'model', params: {} } : null;
}

/** Cursor's own order within a family; families in the product's order, GLM and Kimi under Other. */
function familySections(models: CloudAgentModel[]): CloudAgentModelSection[] {
    return familyOrder.flatMap(({ families, title }) => {
        const options = models
            .filter((model) => families.includes(model.family))
            .sort((a, b) => a.order - b.order)
            .map((model) => optionOf(model.id, model.displayName, model.description));
        return options.length > 0 ? [{ id: title.toLowerCase(), options, title }] : [];
    });
}

const familyOrder: { families: CloudAgentModelFamily[]; title: string }[] = [
    { families: ['claude'], title: 'Claude' },
    { families: ['gpt'], title: 'GPT' },
    { families: ['gemini'], title: 'Gemini' },
    { families: ['grok'], title: 'Grok' },
    { families: ['composer'], title: 'Composer' },
    { families: ['glm', 'kimi', 'other'], title: 'Other' },
];

function optionOf(id: string, label: string, description: string | null): CloudAgentModelOption {
    return {
        description,
        id,
        label,
        searchText: `${label} ${id}`.toLowerCase(),
        unavailable: false,
    };
}

/** Cursor's own Auto router, sent as its `default` catalog id. */
const autoOption = optionOf(autoModelKey, 'Auto', 'Cursor picks a model for each run.');

function modelState(settings: CloudAgentSettings): CloudAgentModelView['state'] {
    if (settings.model.kind === 'auto') {
        return 'auto';
    }
    return settings.savedModelUnavailable ? 'unavailable' : 'model';
}
