import { mergeProps, mergeRefs } from '@react-aria/utils';
import * as React from 'react';
import { useFocusable } from 'react-aria';
import { Link } from 'react-router-dom';

export function TooltipLink({ ref, ...props }: React.ComponentProps<typeof Link>) {
    const linkRef = React.useRef<HTMLAnchorElement>(null);
    const { focusableProps } = useFocusable({}, linkRef);
    const mergedRef = React.useMemo(() => mergeRefs(linkRef, ref), [ref]);
    return <Link {...mergeProps(focusableProps, props)} ref={mergedRef} />;
}
