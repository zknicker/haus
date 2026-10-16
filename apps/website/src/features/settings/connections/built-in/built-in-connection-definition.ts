import type { Agent, McpPreset } from '@haus/api';
import type { ComponentType, ReactNode } from 'react';
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
 * What a built-in adds to one Agent's row in the generic Agent access list.
 * The row's trailing side is always the access switch alone, so every
 * row's switch lines up; per-Agent controls live on the description line.
 */
export interface AgentAccessRowExtension {
    /** Under the Agent's name: how it shows up in the service, and its controls. */
    description?: ReactNode;
    /** Expands below the row, such as a setup panel the row started. */
    detail?: ReactNode;
}

/**
 * What a built-in adds to the generic Agent access section, so one list
 * carries both the grant switch and the service's per-Agent state.
 */
export interface AgentAccessExtension {
    /** One line under the section title. */
    description?: ReactNode;
    /** Rows after the Agents, such as a default-Agent picker. */
    footer?: ReactNode;
    row: (agent: Agent, granted: boolean) => AgentAccessRowExtension;
}

/**
 * Supplies the extension to the Agent access section it wraps. It renders
 * `children(null)` until it has something to add, and may render dialogs
 * beside the list.
 */
export type AgentAccessExtender = ComponentType<
    BuiltInConnectionSectionProps & {
        children: (extension: AgentAccessExtension | null) => ReactNode;
    }
>;

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
    /** Extends the generic Agent access list with the service's per-Agent state. */
    AgentAccess?: AgentAccessExtender;
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
