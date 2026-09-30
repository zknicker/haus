import { cn } from '../../lib/utils.ts';
import { identityMarkRadius } from '../ui/entity-avatar.tsx';
import { Icon } from '../ui/icon.tsx';
import { getChannelColorStyle } from './channel-color-options.ts';
import { useChannelIconGlyph } from './channel-icon-catalog.ts';

// Sidebar, topbar and Inbox-row boxes match the agent avatars beside them, right
// down to the shape: an exact box pairs its own radius, so a channel stays as
// round as the Agents beside it at every scale step. `inline` serves compact
// text rows, `reference` serves rich inline references and compact hover-card
// titles, and `modal` fills a Modal.Icon slot so a dialog header can preview
// the channel itself. `preview` matches the Agent identity mark.
//
// Variants carry geometry plus the sidebar's named surface role. Box and glyph
// colors resolve per theme on the `channel-icon-box` classes in
// `styles/default-theme.css`, where the sidebar can soften its larger mark and
// the always-dark reference preview can rebind it — Tailwind's `dark:` variant
// cannot.
const channelIconBoxVariants = {
    /** An Inbox row's leading mark, matching the 32px Agent avatars beside it. */
    inboxRow: { boxSize: 32, iconSize: 20 },
    inline: { boxSize: 20, iconSize: 14 },
    modal: { boxClassName: 'size-10 rounded-3xl', iconSize: 20 },
    preview: { boxSize: 44, iconSize: 22 },
    reference: { boxSize: 18, iconSize: 13 },
    // Fixed, not size-6: the box must hold the 24px Agent avatars' scale
    // rather than shrinking with the sidebar's spacing token.
    sidebar: { boxClassName: 'channel-icon-box--sidebar', boxSize: 24, iconSize: 16 },
    /** A workspace tab's leading mark: a touch larger than a 16px favicon, since the box eats into the glyph. */
    tab: { boxSize: 20, iconSize: 14 },
    topbar: { boxSize: 24, iconSize: 16 },
} as const;

/**
 * A channel's icon in its colored box. `icon` names a curated hugeicons export
 * and `color` a palette preset id; either one null renders the default hash in
 * a neutral foreground-tinted box.
 */
export function ChannelIconBox({
    className,
    color,
    icon,
    iconClassName,
    size = 'sidebar',
}: {
    className?: string;
    color?: string | null;
    icon?: string | null;
    iconClassName?: string;
    size?: keyof typeof channelIconBoxVariants;
}) {
    const variant = channelIconBoxVariants[size];
    const glyph = useChannelIconGlyph(icon);
    // `modal` sizes itself from classes; every other variant carries an exact
    // box, and an exact box has to derive its radius or the corner stays put
    // while the box moves.
    const boxStyle =
        'boxSize' in variant
            ? {
                  borderRadius: identityMarkRadius(variant.boxSize),
                  height: variant.boxSize,
                  width: variant.boxSize,
              }
            : undefined;

    return (
        <span
            aria-hidden="true"
            className={cn(
                'channel-icon-box flex shrink-0 items-center justify-center',
                'boxClassName' in variant ? variant.boxClassName : undefined,
                className
            )}
            style={{ ...boxStyle, ...getChannelColorStyle(color) }}
        >
            <Icon
                className={cn('shrink-0', iconClassName)}
                icon={glyph}
                size={variant.iconSize}
                // Inline size so container rules like the sidebar menu
                // button's `[&_svg]:size-5` cannot inflate the glyph.
                style={{ height: variant.iconSize, width: variant.iconSize }}
            />
        </span>
    );
}
