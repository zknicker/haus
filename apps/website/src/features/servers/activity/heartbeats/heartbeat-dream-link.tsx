import * as React from 'react';
import { DreamSheet } from '../../../members/agent-profile/dream-sheet.tsx';

/** "See memory changes": opens the dream's sheet, which reads its own detail by run. */
export function HeartbeatDreamLink({
    agentId,
    runId,
    serverId,
}: {
    agentId: string;
    runId: string;
    serverId: string;
}) {
    const [isOpen, setOpen] = React.useState(false);
    return (
        <>
            <button
                className="cursor-(--cursor-interactive) rounded-sm text-accent hover:underline"
                onClick={() => setOpen(true)}
                type="button"
            >
                See memory changes
            </button>
            <DreamSheet
                agentId={agentId}
                onOpenChange={setOpen}
                runId={isOpen ? runId : null}
                serverId={serverId}
            />
        </>
    );
}
