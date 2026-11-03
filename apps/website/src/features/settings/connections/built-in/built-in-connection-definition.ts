import type { McpPreset } from '@haus/api';
import type { ComponentType } from 'react';
import type { McpConnection } from '../../mcp/mcp-server-shared.ts';

/** What every built-in section receives from the connection page. */
export interface BuiltInConnectionSectionProps {
    connection: McpConnection;
    serverId: string;
}

export interface BuiltInConnectionSection {
    id: string;
    Section: ComponentType<BuiltInConnectionSectionProps>;
}

/**
 * One built-in connection's contribution to its settings page: sections that
 * sit under the signed-in account. The page renders the generic sections plus
 * these, and never branches on a preset.
 */
export interface BuiltInConnectionDefinition {
    preset: McpPreset;
    sections: readonly BuiltInConnectionSection[];
}
