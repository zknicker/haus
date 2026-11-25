import { Button, Disclosure } from '@heroui/react';
import type * as React from 'react';

export function PanelSection({
    children,
    count,
    title,
}: {
    children: React.ReactNode;
    count: number;
    title: string;
}) {
    return (
        <Disclosure aria-label={title} className="task-rail-section" defaultExpanded>
            <Disclosure.Heading>
                <Button size="sm" slot="trigger" variant="ghost">
                    {title}
                    <span className="tabular-nums">{count}</span>
                    <Disclosure.Indicator />
                </Button>
            </Disclosure.Heading>
            <Disclosure.Content>
                <Disclosure.Body>{children}</Disclosure.Body>
            </Disclosure.Content>
        </Disclosure>
    );
}
