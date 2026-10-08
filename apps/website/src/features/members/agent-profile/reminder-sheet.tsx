import type { Agent, Reminder } from '@haus/api';
import { Sheet } from '@heroui-pro/react';
import * as React from 'react';
import { ReminderDetailPanel } from './reminder-detail-panel.tsx';

/**
 * One Reminder's detail, in the same right sheet a Trigger opens in — same
 * width, same header shape, same group order — so the two halves of the
 * Automations page read as one system. Agents author Reminders, so the sheet
 * reads them and offers the one operator action: canceling.
 */
export function ReminderSheet({
    agent,
    onOpenChange,
    reminder,
    serverId,
    serverSlug,
}: {
    agent: Agent;
    onOpenChange: (open: boolean) => void;
    reminder: Reminder | null;
    serverId: string;
    serverSlug: string;
}) {
    // The panel animates itself out, so the last reminder is held until the
    // next open replaces it rather than emptying the panel mid-slide.
    const held = React.useRef(reminder);
    if (reminder) {
        held.current = reminder;
    }
    const shown = reminder ?? held.current;

    return (
        <Sheet
            // Nothing in here is draggable, and a side sheet treats every
            // horizontal drag as a dismiss — which would fight text selection.
            isHandleOnly
            isOpen={reminder !== null}
            onOpenChange={onOpenChange}
            placement="right"
        >
            <Sheet.Backdrop>
                {/* The Trigger sheet's measure, so switching between the two
                    sections never changes the sheet's shape. */}
                <Sheet.Content className="w-[34rem]">
                    <Sheet.Dialog>
                        <Sheet.CloseTrigger />
                        {shown ? (
                            <ReminderDetailPanel
                                agentId={agent.id}
                                agentName={agent.displayName}
                                key={shown.id}
                                onClose={() => onOpenChange(false)}
                                reminder={shown}
                                serverId={serverId}
                                serverSlug={serverSlug}
                            />
                        ) : null}
                    </Sheet.Dialog>
                </Sheet.Content>
            </Sheet.Backdrop>
        </Sheet>
    );
}
