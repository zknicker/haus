import * as React from 'react';
import type { BandCrumbDrop } from './band-trail.ts';

/**
 * A trail crumb that takes drops (`BandCrumb.drop`): while an accepted drag
 * is over it, it lights up (`.band-crumb-drop[data-drop-target]`) and the
 * drop lands there. Native drag events, like the page's own drop targets, so
 * a drag the crumb refuses passes by untouched.
 */
export function CrumbDropTarget({
    children,
    drop,
}: {
    children: React.ReactNode;
    drop: BandCrumbDrop;
}) {
    const [isTarget, setTarget] = React.useState(false);
    // dragenter/dragleave fire for every child crossed; count to know when the pointer truly left.
    const depth = React.useRef(0);
    const accepts = (event: React.DragEvent) => drop.accepts([...event.dataTransfer.types]);
    const handlers = {
        onDragEnter: (event: React.DragEvent) => {
            depth.current += 1;
            setTarget(accepts(event));
        },
        onDragLeave: () => {
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) {
                setTarget(false);
            }
        },
        onDragOver: (event: React.DragEvent) => {
            const accepted = accepts(event);
            setTarget(accepted);
            if (accepted) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
            }
        },
        onDrop: (event: React.DragEvent) => {
            depth.current = 0;
            setTarget(false);
            if (accepts(event)) {
                event.preventDefault();
                drop.onDrop();
            }
        },
    };
    return (
        <span className="band-crumb-drop" data-drop-target={isTarget || undefined} {...handlers}>
            {children}
        </span>
    );
}
