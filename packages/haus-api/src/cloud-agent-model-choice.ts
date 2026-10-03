import type {
    CloudAgentModel,
    CloudAgentModelCatalog,
    CloudAgentModelParamName,
    CloudAgentModelParams,
    CloudAgentModelSetting,
    CloudAgentRunModel,
    CloudAgentRunModelParam,
} from './cloud-agent-model.ts';

/** Cursor spells fast mode `fast` on every model that offers it. */
export const cursorFastParamId = 'fast';

/**
 * The one fallback rule: send the saved model only when the catalog lists it;
 * otherwise send none and record which saved model fell back. A saved
 * parameter the listed model no longer offers with the saved value is dropped,
 * so that Run takes the model's default for it, and the drop is recorded.
 */
export function resolveCloudAgentRunModel(
    setting: CloudAgentModelSetting,
    catalog: CloudAgentModelCatalog | null
): CloudAgentRunModel {
    if (setting.kind === 'auto') {
        return { droppedParams: [], fallbackFrom: null, id: null, params: [] };
    }
    const model = findCloudAgentModel(setting.id, catalog);
    if (!model) {
        return { droppedParams: [], fallbackFrom: setting.id, id: null, params: [] };
    }
    const params: CloudAgentRunModelParam[] = [];
    const { effort, fast } = setting.params;
    if (effort !== undefined && model.effort && offersEffort(model, effort)) {
        params.push({
            name: 'effort',
            providerParamId: model.effort.providerParamId,
            value: effort,
        });
    }
    if (fast !== undefined && model.fast) {
        params.push({ name: 'fast', providerParamId: cursorFastParamId, value: String(fast) });
    }
    return {
        droppedParams: unofferedCloudAgentModelParams(model, setting.params),
        fallbackFrom: null,
        id: model.id,
        params,
    };
}

/** The chosen parameters this model does not offer, with that value or at all. */
export function unofferedCloudAgentModelParams(
    model: CloudAgentModel,
    params: CloudAgentModelParams
): CloudAgentModelParamName[] {
    const unoffered: CloudAgentModelParamName[] = [];
    if (params.effort !== undefined && !offersEffort(model, params.effort)) {
        unoffered.push('effort');
    }
    if (params.fast !== undefined && !model.fast) {
        unoffered.push('fast');
    }
    return unoffered;
}

export function findCloudAgentModel(
    modelId: string,
    catalog: CloudAgentModelCatalog | null
): CloudAgentModel | null {
    return catalog?.models.find((model) => model.id === modelId) ?? null;
}

export function isCloudAgentModelListed(
    modelId: string,
    catalog: CloudAgentModelCatalog | null
): boolean {
    return findCloudAgentModel(modelId, catalog) !== null;
}

function offersEffort(model: CloudAgentModel, value: string): boolean {
    return model.effort?.options.some((option) => option.value === value) ?? false;
}
