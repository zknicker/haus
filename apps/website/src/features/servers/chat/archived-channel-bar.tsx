import type { Chat } from '@haus/api';
import { Button, toast } from '@heroui/react';
import { useChannelUnarchive } from '../../../hooks/servers/use-channel-lifecycle.ts';

export function ArchivedChannelBar({ canManage, chat }: { canManage: boolean; chat: Chat }) {
    const unarchive = useChannelUnarchive();

    return (
        <div className="text-muted mx-auto flex w-full items-center justify-between gap-4 px-9 pb-4 text-sm">
            <p>This project is archived. Its history is read-only.</p>
            {canManage ? (
                <Button
                    isPending={unarchive.isPending}
                    onPress={() =>
                        unarchive
                            .mutateAsync({ chatId: chat.id, serverId: chat.serverId })
                            .then(() => toast.success('Project restored'))
                            .catch((error: Error) =>
                                toast.danger('Restore failed', { description: error.message })
                            )
                    }
                    size="sm"
                    variant="outline"
                >
                    Restore
                </Button>
            ) : null}
        </div>
    );
}
