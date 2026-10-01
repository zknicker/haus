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
 * A first-party preset carries bundled art (`mcpPresetIcons` in `@haus/api`),
 * so a Recommended preset shows its real mark before it is added. Once added,
 * Haus Server reports whatever discovery resolved and falls back to that same
 * bundled art when discovery finds nothing, so the mark never regresses to a
 * monogram. Custom connections get no bundled art: theirs comes only from the
 * server's own resolution.
 */

/**
 * Every host owns the box — `ItemCard.Icon` on both lists, `Modal.Icon` in the
 * detail dialog — so this draws only what goes inside one.
 */
export function ConnectionGlyph({ connection }: { connection: ConnectionMarkSubject }) {
    const icon = connectionIcon(connection, useResolvedThemeOptional());

    if (icon.kind === 'image') {
        return (
            <img
                alt=""
                className="size-full rounded-[inherit] object-cover"
                height={32}
                src={icon.src}
                width={32}
            />
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
