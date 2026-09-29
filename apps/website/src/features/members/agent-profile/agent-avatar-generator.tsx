import * as React from 'react';
import { AvatarGenerationDialog } from './agent-avatar-generation-dialog.tsx';
import { useAvatarGenerationSession } from './use-avatar-generation-session.ts';

/**
 * The generation dialog plus its session. The opener owns `open` (the avatar
 * menu) and keeps this mounted while the dialog is closed, so a run started
 * here survives closing; key it by Agent so a different Agent starts fresh.
 */
export function AgentAvatarGenerator({
    agentId,
    currentAvatarUrl,
    name,
    onOpenChange,
    open,
    serverId,
}: {
    agentId: string;
    currentAvatarUrl: string | null;
    name: string;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    serverId: string;
}) {
    const {
        changeConcept,
        open: openSession,
        save,
        session,
        stage,
        startGeneration,
    } = useAvatarGenerationSession({
        agentId,
        serverId,
    });
    // A saved session resets as the dialog reopens, not as it animates out.
    const [wasOpen, setWasOpen] = React.useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            openSession();
        }
    }

    return (
        <AvatarGenerationDialog
            currentAvatarUrl={currentAvatarUrl}
            name={name}
            onConceptChange={changeConcept}
            onGenerate={() => {
                void startGeneration();
            }}
            onOpenChange={(nextOpen) => {
                if (nextOpen || !session.saving) {
                    onOpenChange(nextOpen);
                }
            }}
            onSave={() => {
                void save().then((saved) => {
                    if (saved) {
                        onOpenChange(false);
                    }
                });
            }}
            onStage={stage}
            open={open}
            session={session}
        />
    );
}
