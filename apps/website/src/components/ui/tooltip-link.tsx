import { mergeProps, mergeRefs } from '@react-aria/utils';
import * as React from 'react';
import { useFocusable } from 'react-aria';
import { Link } from 'react-router-dom';

/**
 * A router link that is its own Tooltip trigger, so keyboard focus and hover
 * both open the tooltip on the link itself. It reads the trigger props the way
 * HeroUI's `Tooltip.Trigger` does, through `useFocusable`, rather than
 * React Aria's `<Focusable>`, whose dev check misfires inside inert subtrees.
 */
export function TooltipLink({ ref, ...props }: React.ComponentProps<typeof Link>) {
    const linkRef = React.useRef<HTMLAnchorElement>(null);
    const { focusableProps } = useFocusable({}, linkRef);
    const mergedRef = React.useMemo(() => mergeRefs(linkRef, ref), [ref]);
    return <Link {...mergeProps(focusableProps, props)} ref={mergedRef} />;
}
