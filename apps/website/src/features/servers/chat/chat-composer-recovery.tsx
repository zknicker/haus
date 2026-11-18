import { Alert, Button } from '@heroui/react';
import type { FailedChatDraft } from './chat-draft-store.ts';

export function ChatComposerRecovery({
    drafts,
    onDiscard,
    onRestore,
}: {
    drafts: readonly FailedChatDraft[];
    onDiscard: (id: string) => void;
    onRestore: (id: string) => void;
}) {
    if (drafts.length === 0) {
        return null;
    }

    return (
        <Alert
            aria-live="polite"
            className="mb-2"
            data-testid="chat-composer-recovery"
            status="danger"
        >
            <Alert.Indicator />
            <Alert.Content className="min-w-0">
                <Alert.Title>
                    {drafts.length === 1
                        ? 'A message failed to send.'
                        : `${drafts.length} messages failed to send.`}
                </Alert.Title>
                <div className="flex flex-col gap-1">
                    {drafts.map((draft) => (
                        <div className="flex min-w-0 items-center gap-2" key={draft.id}>
                            <p className="min-w-0 flex-1 truncate text-sm">
                                {draft.content.trim() ||
                                    `${draft.attachments.length} attachment${draft.attachments.length === 1 ? '' : 's'}`}
                            </p>
                            <Button onPress={() => onRestore(draft.id)} size="sm" variant="outline">
                                Restore
                            </Button>
                            <Button
                                aria-label="Dismiss failed message"
                                onPress={() => onDiscard(draft.id)}
                                size="sm"
                                variant="danger-soft"
                            >
                                Dismiss
                            </Button>
                        </div>
                    ))}
                </div>
            </Alert.Content>
        </Alert>
    );
}
