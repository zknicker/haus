import type { McpPreset } from '@haus/api';
import { githubConnection } from '../github/github-connection.ts';
import type { BuiltInConnection } from './built-in-connection.ts';

const builtInConnections: ReadonlyMap<McpPreset, BuiltInConnection> = new Map(
    [githubConnection].map((connection) => [connection.preset, connection])
);

/** The only lookup from a preset to its built-in connection module. */
export function builtInConnection(preset: McpPreset | null): BuiltInConnection | undefined {
    return preset ? builtInConnections.get(preset) : undefined;
}
