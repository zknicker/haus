import * as z from 'zod';
import { rankWranglerMcpUrl } from './amazon-products.ts';
import type { McpConnection, McpPreset } from './mcp.ts';

/** Every chat chip a connection can add. */
export const connectionChipKindSchema = z.enum(['amazon-product', 'linear-issue']);
export type ConnectionChipKind = z.infer<typeof connectionChipKindSchema>;

/** The connection fields that decide whether it provides a chip. */
export type ChipSourceConnection = Pick<McpConnection, 'connected' | 'preset' | 'tools' | 'url'>;

/**
 * A chip a connection adds to chat. `provides` is the one check the App's
 * chip gate, the Server's chip reads, and the Agent's start facts share.
 * `preset` names the connection whose settings page describes the chip.
 */
export interface ConnectionChip {
    description: string;
    kind: ConnectionChipKind;
    preset: McpPreset;
    provides: (connection: ChipSourceConnection) => boolean;
    title: string;
}

export const rankWranglerProductTool = 'rankwrangler_product';

const chipsByKind: Record<ConnectionChipKind, Omit<ConnectionChip, 'kind'>> = {
    'amazon-product': {
        description: 'Amazon ASINs and product links in chat become product chips with a preview.',
        preset: 'rankwrangler',
        provides: (connection) =>
            connection.connected &&
            connection.url === rankWranglerMcpUrl &&
            connection.tools.includes(rankWranglerProductTool),
        title: 'Product chips',
    },
    'linear-issue': {
        description: 'Linear issue links in chat become issue chips with their state and owner.',
        preset: 'linear',
        provides: (connection) => connection.preset === 'linear',
        title: 'Issue chips',
    },
};

export const connectionChips: readonly ConnectionChip[] = connectionChipKindSchema.options.map(
    (kind) => ({ ...chipsByKind[kind], kind })
);

/** The first connection that provides this chip, if any. */
export function chipConnection<Connection extends ChipSourceConnection>(
    kind: ConnectionChipKind,
    connections: readonly Connection[]
): Connection | undefined {
    return connections.find(chipsByKind[kind].provides);
}

/** The chips a Server's connections provide, in declaration order. */
export function availableChipKinds(
    connections: readonly ChipSourceConnection[]
): ConnectionChipKind[] {
    return connectionChipKindSchema.options.filter(
        (kind) => chipConnection(kind, connections) !== undefined
    );
}

/** The chips a preset's connection adds, for its settings page. */
export function presetChips(preset: McpPreset | null): ConnectionChip[] {
    return connectionChips.filter((chip) => chip.preset === preset);
}
