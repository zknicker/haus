import { Modal } from '@heroui/react';
import { AdventCalendar } from './advent-calendar.tsx';
import type { AdventSeason } from './advent-season.ts';

/** The advent calendar as a dialog: a dense header over the doors, closed by its button or the backdrop. */
export function AdventCalendarDialog({
    onClose,
    season,
    serverId,
}: {
    onClose: () => void;
    season: AdventSeason;
    serverId: string;
}) {
    return (
        <Modal.Backdrop isDismissable isOpen onOpenChange={(open) => !open && onClose()}>
            {/* Outside scroll leaves the body unclipped for today's glow on the edge doors. */}
            <Modal.Container scroll="outside" size="md">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>Advent · December</Modal.Heading>
                        <p className="text-muted text-sm leading-5">Your year in Haus</p>
                    </Modal.Header>
                    <Modal.Body>
                        <AdventCalendar season={season} serverId={serverId} />
                    </Modal.Body>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}
