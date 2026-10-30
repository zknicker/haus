import { Button, Popover } from '@heroui/react';
import type { ReactNode } from 'react';
import * as React from 'react';

/**
 * One of the strip's two openers — "+N" for the full Agents meter, "N running"
 * for Happening now — as a stock ghost `Button` that opens a stock `Popover`
 * holding the same list the wide rail shows.
 *
 * The popover is controlled so a row can close it on the way out: opening an
 * Agent's DM or a Cloud Agent work's place should not leave the list hanging
 * over wherever the reader lands. The body is a render function for that one
 * reason — it is handed `close`.
 */
export function InboxStripPopover({
    children,
    heading,
    label,
    trigger,
}: {
    children: (close: () => void) => ReactNode;
    /** The list's own name, as the rail labels it. */
    heading: string;
    /** The trigger's accessible name: what it opens, with its count. */
    label: string;
    trigger: ReactNode;
}) {
    const [isOpen, setOpen] = React.useState(false);

    return (
        <Popover isOpen={isOpen} onOpenChange={setOpen}>
            <Button aria-label={label} size="sm" variant="ghost">
                {trigger}
            </Button>
            <Popover.Content className="w-[min(20rem,calc(100vw-2rem))]" placement="bottom end">
                <Popover.Dialog className="flex max-h-[min(28rem,70vh)] flex-col gap-3 overflow-y-auto">
                    <Popover.Heading>{heading}</Popover.Heading>
                    {children(() => setOpen(false))}
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}
