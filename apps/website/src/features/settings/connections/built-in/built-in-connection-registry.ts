import type { McpPreset } from '@haus/api';
import type { BuiltInConnectionDefinition } from './built-in-connection-definition.ts';
import { githubConnectionDefinition } from './github/github-connection-definition.ts';
import { linearConnectionDefinition } from './linear/linear-connection-definition.ts';

export const builtInConnectionDefinitions: readonly BuiltInConnectionDefinition[] = [
    githubConnectionDefinition,
    linearConnectionDefinition,
];

const definitionsByPreset: ReadonlyMap<McpPreset, BuiltInConnectionDefinition> = new Map(
    builtInConnectionDefinitions.map((definition) => [definition.preset, definition])
);

/** The only lookup from a preset to its built-in connection definition. */
export function builtInConnectionDefinition(preset: McpPreset | null) {
    return preset ? definitionsByPreset.get(preset) : undefined;
}
