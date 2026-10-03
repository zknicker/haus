import type { CloudAgentModel, CloudAgentModelParams, CloudAgentModelSetting } from '@haus/api';
import { unofferedCloudAgentModelParams } from '@haus/api';

export interface CloudAgentEffortOption {
    isDefault: boolean;
    label: string;
    value: string;
}

/**
 * The Effort and Fast rows for one listed saved model. A control is `null`
 * when the model does not offer it. Each shows the saved value, or the model's
 * default when nothing is saved or the saved value is no longer offered (Runs
 * drop it too). `effort.selected` is `null` only when nothing is saved and
 * Cursor names no default.
 */
export interface CloudAgentModelParamsView {
    effort: { options: CloudAgentEffortOption[]; selected: string | null } | null;
    fast: { selected: boolean } | null;
    model: CloudAgentModel;
    /** The saved params minus any the model no longer offers: safe to resend. */
    params: CloudAgentModelParams;
}

export function cloudAgentModelParamsView(
    model: CloudAgentModel,
    saved: CloudAgentModelParams
): CloudAgentModelParamsView {
    const params = offeredParams(model, saved);
    const effort = model.effort;
    const fast = model.fast;

    return {
        effort: effort
            ? {
                  options: effort.options.map((option) => ({
                      isDefault: option.value === effort.defaultValue,
                      label: option.displayName,
                      value: option.value,
                  })),
                  selected: params.effort ?? effort.defaultValue,
              }
            : null,
        fast: fast ? { selected: params.fast ?? fast.defaultValue } : null,
        model,
        params,
    };
}

/**
 * The setting with one param changed. Picking the model's own default leaves
 * the param unset, so the Server keeps following Cursor's default for it.
 */
export function settingWithParam(
    view: CloudAgentModelParamsView,
    change: { effort: string } | { fast: boolean }
): CloudAgentModelSetting {
    const { model } = view;
    const { effort, fast } = { ...view.params, ...change };
    const params: CloudAgentModelParams = {
        ...(effort !== undefined && effort !== model.effort?.defaultValue ? { effort } : {}),
        ...(fast !== undefined && fast !== model.fast?.defaultValue ? { fast } : {}),
    };
    return { id: model.id, kind: 'model', params };
}

function offeredParams(
    model: CloudAgentModel,
    saved: CloudAgentModelParams
): CloudAgentModelParams {
    const unoffered = new Set(unofferedCloudAgentModelParams(model, saved));
    return Object.fromEntries(
        Object.entries(saved).filter(([name]) => !unoffered.has(name as 'effort' | 'fast'))
    );
}
