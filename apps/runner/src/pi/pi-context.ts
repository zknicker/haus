import { DEFAULT_COMPACTION_POLICY } from '@earendil-works/pi-durable';
import { estimateTokens, type HarnessContext } from '../turn/context-snapshot.ts';

export function piHarnessContext(
    model: { readonly contextWindow: number },
    tools: readonly {
        readonly description: string;
        readonly name: string;
        readonly parameters: unknown;
    }[]
) {
    const { backgroundTokens, reserveTokens } = DEFAULT_COMPACTION_POLICY;
    const schemas = tools.map(({ description, name, parameters }) => ({
        description,
        name,
        parameters,
    }));
    const context: HarnessContext = {
        compactAtTokens: model.contextWindow - reserveTokens - backgroundTokens,
        contextWindow: model.contextWindow,
        kind: 'window',
        toolTokens: estimateTokens(JSON.stringify(schemas)),
    };
    return context;
}
