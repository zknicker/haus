import type { Board } from '@haus/api';
import { AlertDialog, Button } from '@heroui/react';
import { useUpdateBoard } from '../../hooks/boards/use-update-board.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';

/**
 * Archiving takes a board out of every list and refuses it new Tasks. The
 * route falls back to `/tasks` once the board leaves `board.list`.
 */
export function ArchiveBoardDialog({
    board,
    isOpen,
    onOpenChange,
}: {
    board: Board;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const update = useUpdateBoard();

    return (
        <AlertDialog isOpen={isOpen} onOpenChange={onOpenChange}>
            <AlertDialog.Backdrop isDismissable>
                <AlertDialog.Container size="sm">
                    <AlertDialog.Dialog>
                        <AlertDialog.Header>
                            <AlertDialog.Icon status="danger" />
                            <AlertDialog.Heading>{`Archive ${board.name}?`}</AlertDialog.Heading>
                        </AlertDialog.Header>
                        <AlertDialog.Body>
                            Its Tasks leave every list, and it takes no new ones.
                            <SettingsRowError>{update.error?.message}</SettingsRowError>
                        </AlertDialog.Body>
                        <AlertDialog.Footer>
                            <Button slot="close" variant="secondary">
                                Cancel
                            </Button>
                            <Button
                                isPending={update.isPending}
                                onPress={() =>
                                    update.mutate({
                                        boardId: board.id,
                                        expectedVersion: board.version,
                                        patch: { archived: true },
                                        serverId: board.serverId,
                                    })
                                }
                                variant="danger"
                            >
                                Archive board
                            </Button>
                        </AlertDialog.Footer>
                    </AlertDialog.Dialog>
                </AlertDialog.Container>
            </AlertDialog.Backdrop>
        </AlertDialog>
    );
}
