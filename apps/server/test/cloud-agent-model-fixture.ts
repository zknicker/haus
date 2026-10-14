export const nano = {
    description: null,
    displayName: 'GPT-5.4 Nano',
    effort: {
        defaultValue: 'medium',
        options: [
            { displayName: 'Low', value: 'low' },
            { displayName: 'Medium', value: 'medium' },
            { displayName: 'High', value: 'high' },
        ],
        providerParamId: 'reasoning',
    },
    family: 'gpt' as const,
    fast: { defaultValue: true },
    id: 'gpt-5.4-nano',
    order: 0,
};
export const opus = {
    description: 'Frontier',
    displayName: 'Claude Opus',
    effort: null,
    family: 'claude' as const,
    fast: null,
    id: 'claude-opus',
    order: 1,
};
export const noModel = { droppedParams: [], fallbackFrom: null, id: null, params: [] };
export const auto = { ...noModel, id: 'default' };
