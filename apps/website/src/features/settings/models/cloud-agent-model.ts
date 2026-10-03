import type { CloudAgentModelSetting, CloudAgentSettings } from '@haus/api';

/** Never a Cursor model id, so Cursor default cannot collide with a listed model. */
export const autoModelKey = 'haus:auto';

export interface CloudAgentModelOption {
    description: string | null;
    id: string;
    label: string;
    /** The saved model the catalog no longer lists: shown, never pickable. */
    unavailable: boolean;
}

/**
 * What the Model row shows for one settings read.
 *
 * - `auto`: nothing saved; Haus sends no model, so Cursor uses the account's
 *   default (Auto unless the account changed it).
 * - `model`: a listed model is saved.
 * - `unavailable`: a saved model the freshest catalog does not list, so
 *   launches fall back to Cursor default.
 *
 * `catalogMissing` is independent: no Computer has reported a catalog, so only
 * Cursor default can be chosen.
 */
export interface CloudAgentModelView {
    catalogMissing: boolean;
    options: CloudAgentModelOption[];
    /** False only when there is nothing to pick between: Cursor default and no catalog. */
    pickable: boolean;
    refreshedAt: string | null;
    selectedKey: string;
    selectedLabel: string;
    state: 'auto' | 'model' | 'unavailable';
}

export function cloudAgentModelView(settings: CloudAgentSettings): CloudAgentModelView {
    const catalog = settings.catalog;
    const listed = (catalog?.models ?? []).map(
        (model): CloudAgentModelOption => ({
            description: model.description,
            id: model.id,
            label: model.displayName,
            unavailable: false,
        })
    );
    const state = modelState(settings);
    const saved = settings.model.kind === 'model' ? settings.model.id : null;
    const unavailableOption: CloudAgentModelOption[] =
        state === 'unavailable' && saved
            ? [{ description: null, id: saved, label: saved, unavailable: true }]
            : [];
    const options = [autoOption, ...unavailableOption, ...listed];
    const selectedKey = saved ?? autoModelKey;

    return {
        catalogMissing: catalog === null,
        options,
        pickable: options.length > 1,
        refreshedAt: catalog?.refreshedAt ?? null,
        selectedKey,
        selectedLabel: options.find((option) => option.id === selectedKey)?.label ?? selectedKey,
        state,
    };
}

/** The Select's key back to the contract's union; `null` for an unknown key. */
export function modelSettingForKey(
    key: unknown,
    view: CloudAgentModelView
): CloudAgentModelSetting | null {
    if (key === autoModelKey) {
        return { kind: 'auto' };
    }
    const option = view.options.find((candidate) => candidate.id === key);
    return option && !option.unavailable ? { id: option.id, kind: 'model' } : null;
}

/** Haus sends no model, so Cursor resolves the account's configured default; the row's tooltip says so. */
const autoOption: CloudAgentModelOption = {
    description: null,
    id: autoModelKey,
    label: 'Cursor default',
    unavailable: false,
};

function modelState(settings: CloudAgentSettings): CloudAgentModelView['state'] {
    if (settings.model.kind === 'auto') {
        return 'auto';
    }
    return settings.savedModelUnavailable ? 'unavailable' : 'model';
}
