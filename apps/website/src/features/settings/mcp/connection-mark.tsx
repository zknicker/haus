import { useResolvedThemeOptional } from '../../../components/theme-provider.tsx';
import { connectionIcon } from './connection-icon.ts';
import type { McpConnection } from './mcp-server-shared.ts';

/**
 * How a connection draws its mark.
 *
 * Every row on the Connections page is an MCP server, so every row carries a
 * mark from the same resolver — a preset the operator has not added yet is
 * still an MCP server, and drawing it bare made the Recommended list read as a
 * different kind of thing from the Added one.
 *
 * Haus Server owns service branding before and after an account is added.
 * Recommended uses its preset catalog, with bundled art as a local fallback;
 * saved connections receive the same branding policy in their Server snapshot.
 */

/**
 * Every host owns the box — `ItemCard.Icon` on both lists, the hero tile on the
 * connection page — so this draws only what goes inside one.
 */
export function ConnectionGlyph({ connection }: { connection: ConnectionMarkSubject }) {
    const icon = connectionIcon(connection, useResolvedThemeOptional());

    if (icon.kind === 'image') {
        return (
            <img alt="" className="connection-mark__image" height={32} src={icon.src} width={32} />
        );
    }
    // The slot sizes `svg`, not text, so a letter would otherwise land on the
    // document's 16px base — a size that appears nowhere else in the app.
    return (
        <span className="font-medium text-sm" style={{ color: `var(${icon.colorVar})` }}>
            {icon.letter}
        </span>
    );
}

/**
 * Enough of a connection to draw one. A preset satisfies this with its bundled
 * icon, so presets and saved connections resolve through the same function.
 */
export type ConnectionMarkSubject = Pick<McpConnection, 'icon' | 'id' | 'name'>;
