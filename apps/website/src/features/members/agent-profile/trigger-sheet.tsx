import type { Agent, Trigger } from '@haus/api';
import { Sheet } from '@heroui-pro/react';
import * as React from 'react';
import type { TriggerSheetMode } from './agent-trigger-model.ts';
import { TriggerCreatePanel } from './trigger-create-panel.tsx';
import { TriggerDetailPanel } from './trigger-detail-panel.tsx';
import type { TriggerMintedSecret } from './trigger-webhook-card.tsx';

/**
 * One drawer operates every Trigger. Authoring one does not close it: creating
 * a webhook mints a secret readable exactly once, so the drawer becomes the
 * detail for the record it just made with that secret still on screen, rather
 * than dismissing and stranding it. A GitHub Trigger lands on its detail too.
 */
export function TriggerSheet({
    agent,
    mode,
    onCreated,
    onOpenChange,
    serverId,
}: {
    agent: Agent;
    mode: TriggerSheetMode | null;
    onCreated: (trigger: Trigger) => void;
    onOpenChange: (open: boolean) => void;
    serverId: string;
}) {
    // A minted secret lives above the detail's key so creating can carry it
    // into the detail that follows. Closing the drawer spends it for good.
    const [secret, setSecret] = React.useState<TriggerMintedSecret | null>(null);
    // The panel animates itself out, so the last mode is held until the next
    // open replaces it rather than emptying the panel mid-slide.
    const held = React.useRef(mode);
    if (mode) {
        held.current = mode;
    }
    const shown = mode ?? held.current;

    const close = () => {
        setSecret(null);
        onOpenChange(false);
    };

    return (
        <Sheet
            // Nothing in here is draggable. A side-placed sheet treats every
            // horizontal drag as a dismiss, which would fight text selection
            // and the code blocks' own horizontal scroll; with no handle
            // rendered, handle-only dragging is no dragging at all.
            isHandleOnly
            isOpen={mode !== null}
            onOpenChange={(open) => {
                if (!open) {
                    close();
                }
            }}
            placement="right"
        >
            <Sheet.Backdrop>
                {/* A side-placed sheet carries no size prop — its width is its
                    own measure, set wide enough for the form and for the URL,
                    secret, and curl blocks. */}
                <Sheet.Content className="w-[34rem]">
                    <Sheet.Dialog>
                        <Sheet.CloseTrigger />
                        {shown?.kind === 'create' ? (
                            <TriggerCreatePanel
                                agent={agent}
                                onCancel={close}
                                onCreated={(created, minted) => {
                                    setSecret(minted);
                                    onCreated(created);
                                }}
                                serverId={serverId}
                            />
                        ) : null}
                        {shown?.kind === 'detail' ? (
                            // Keyed by row so a different Trigger starts a
                            // fresh draft instead of carrying the last one over.
                            <TriggerDetailPanel
                                agent={agent}
                                key={shown.trigger.id}
                                onClose={close}
                                onRotated={setSecret}
                                secret={secret?.triggerId === shown.trigger.id ? secret : null}
                                serverId={serverId}
                                trigger={shown.trigger}
                            />
                        ) : null}
                    </Sheet.Dialog>
                </Sheet.Content>
            </Sheet.Backdrop>
        </Sheet>
    );
}
