import type { McpPreset } from '@haus/api';
import type { ComponentType } from 'react';
import type { McpConnection } from '../../mcp/mcp-server-shared.ts';

/**
 * Where a built-in section sits on the connection page, named by the generic
 * section it follows: the signed-in account, Agent access, or tools.
 */
export type BuiltInConnectionPlacement = 'after-account' | 'after-agent-access' | 'after-tools';

/** What every built-in section receives from the connection page. */
export interface BuiltInConnectionSectionProps {
    connection: McpConnection;
    serverId: string;
}

export interface BuiltInConnectionSection {
    id: string;
    placement: BuiltInConnectionPlacement;
    Section: ComponentType<BuiltInConnectionSectionProps>;
}

/**
 * One built-in connection's contribution to its settings page. The page
 * renders the generic sections plus these, and never branches on a preset.
 */
export interface BuiltInConnectionDefinition {
    preset: McpPreset;
    sections: readonly BuiltInConnectionSection[];
}
