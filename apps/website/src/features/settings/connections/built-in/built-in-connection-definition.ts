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

/** Connecting a new account of a built-in service, such as an app install. */
export interface BuiltInConnect {
    isPending: boolean;
    start: () => void;
}

/**
 * One built-in connection's contribution to its settings page. The page
 * renders the generic sections plus these, and never branches on a preset.
 */
export interface BuiltInConnectionDefinition {
    preset: McpPreset;
    /**
     * What a connect redirect brought back. The connections list shows it too,
     * because a failed first connect has no connection page to land on.
     */
    SetupNotice?: ComponentType;
    sections: readonly BuiltInConnectionSection[];
    /** Replaces the generic preset add when connecting takes the service's own flow. */
    useConnect?: (serverId: string) => BuiltInConnect;
}
