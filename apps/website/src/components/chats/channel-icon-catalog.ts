import type { IconSvgElement } from '@hugeicons/react';
import { HashtagIcon } from '@hugeicons-pro/core-solid-rounded';
import * as React from 'react';
import type { ChannelIconEntry } from './channel-icon-catalog.generated.ts';

export type { ChannelIconEntry };

export interface ChannelIconCatalog {
    byName: ReadonlyMap<string, ChannelIconEntry>;
    entries: readonly ChannelIconEntry[];
    groups: readonly string[];
}

/** The default channel glyph, and what a channel shows until its icon resolves. */
export const channelHashGlyph: IconSvgElement = HashtagIcon;

// The generated catalog carries ~1,000 inlined glyphs, so it loads as its own
// chunk once per session. Everything below shares that single load.
let catalog: ChannelIconCatalog | null = null;
let loading: Promise<ChannelIconCatalog> | null = null;
const listeners = new Set<() => void>();

export function loadChannelIconCatalog(): Promise<ChannelIconCatalog> {
    loading ??= import('./channel-icon-catalog.generated.ts')
        .then((module) => {
            catalog = {
                byName: new Map(module.channelIconCatalog.map((entry) => [entry.name, entry])),
                entries: module.channelIconCatalog,
                groups: module.channelIconGroups,
            };

            for (const listener of listeners) {
                listener();
            }

            return catalog;
        })
        .catch((error: unknown) => {
            // Clear the in-flight promise so a later call retries the import
            // instead of replaying this rejection forever.
            loading = null;
            throw error;
        });

    return loading;
}

/** The loaded catalog, or null while the chunk is still in flight. */
export function useChannelIconCatalog(enabled = true): ChannelIconCatalog | null {
    const loaded = React.useSyncExternalStore(subscribe, getCatalog, getCatalog);

    React.useEffect(() => {
        // The hash fallback already covers a failed load; this effect only
        // needs to kick the retryable import off.
        if (enabled) {
            loadChannelIconCatalog().catch(() => undefined);
        }
    }, [enabled]);

    return loaded;
}

/** A channel's glyph, falling back to the hash while loading or when unknown. */
export function useChannelIconGlyph(name: string | null | undefined): IconSvgElement {
    const loaded = useChannelIconCatalog(Boolean(name));

    return (name ? loaded?.byName.get(name)?.glyph : null) ?? channelHashGlyph;
}

/** Every query token has to match the label or a keyword. */
export function filterChannelIcons(
    entries: readonly ChannelIconEntry[],
    query: string
): readonly ChannelIconEntry[] {
    const tokens = query.toLowerCase().split(/\s+/u).filter(Boolean);

    if (tokens.length === 0) {
        return entries;
    }

    return entries.filter((entry) => {
        const haystack = `${entry.label.toLowerCase()} ${entry.keywords.join(' ')}`;

        return tokens.every((token) => haystack.includes(token));
    });
}

function subscribe(listener: () => void) {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

function getCatalog() {
    return catalog;
}
