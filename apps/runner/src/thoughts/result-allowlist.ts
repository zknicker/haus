export interface ToolOperation {
    readonly input: unknown;
    readonly toolName: string;
}

export function admitsResult(operation: ToolOperation) {
    return webSearchTools.has(operation.toolName);
}

const webSearchTools = new Set(['web_search', 'webSearch']);
