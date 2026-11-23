import { Button, Disclosure } from '@heroui/react';
import { useState } from 'react';
import { RecoveryCommands } from './computer-actions.tsx';
import { ComputerSystemLog } from './computer-system-log-card.tsx';

export function ComputerDiagnostics({
    computerId,
    serverId,
    serverSlug,
}: {
    computerId: string;
    serverId: string;
    serverSlug: string;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    return (
        <section>
            <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
                <Disclosure.Heading>
                    <Button size="sm" slot="trigger" variant="ghost">
                        Diagnostics
                        <Disclosure.Indicator />
                    </Button>
                </Disclosure.Heading>
                <Disclosure.Content>
                    {isExpanded ? (
                        <Disclosure.Body className="flex flex-col gap-8 pt-4">
                            <ComputerSystemLog computerId={computerId} serverId={serverId} />
                            <RecoveryCommands serverSlug={serverSlug} />
                        </Disclosure.Body>
                    ) : null}
                </Disclosure.Content>
            </Disclosure>
        </section>
    );
}
