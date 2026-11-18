import type { McpPreset } from '@haus/api';
import { githubConnection } from '../github/github-connection.ts';
import type { BuiltInConnection } from './built-in-connection.ts';

/** Every built-in connection module; the only registry of services. */
export const builtInConnections: readonly BuiltInConnection[] = [githubConnection];

const byPreset: ReadonlyMap<McpPreset, BuiltInConnection> = new Map(
    builtInConnections.map((connection) => [connection.preset, connection])
);

/** The built-in connection module for a preset, if the preset has one. */
export function builtInConnection(preset: McpPreset | null): BuiltInConnection | undefined {
    return preset ? byPreset.get(preset) : undefined;
}
