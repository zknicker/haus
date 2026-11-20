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
        <Disclosure aria-label={title} defaultExpanded>
            <Disclosure.Heading>
                <Button
                    className="w-full justify-start"
                    size="sm"
                    slot="trigger"
                    variant="tertiary"
                >
                    {title}
                    <span className="text-muted tabular-nums">{count}</span>
                    <Disclosure.Indicator />
                </Button>
            </Disclosure.Heading>
            <Disclosure.Content>
                <Disclosure.Body>{children}</Disclosure.Body>
            </Disclosure.Content>
        </Disclosure>
    );
}
