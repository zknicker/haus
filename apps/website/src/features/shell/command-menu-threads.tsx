import type { OpenThread } from '@haus/api';
import { Command } from '@heroui-pro/react';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useOpenThreads } from '../../hooks/threads/use-open-threads.ts';
import { OpenThreadGlyph } from '../threads/open-thread-glyph.tsx';
import { openThreadStatusLine } from '../threads/open-thread-status.ts';
import { useCommandMenu } from './command-menu-provider.tsx';

/** Open Threads by title. The palette's own filter narrows these by `textValue`. */
export function CommandMenuThreadResults({
    onOpen,
    serverId,
}: {
    onOpen: (thread: OpenThread) => void;
    serverId: string;
}) {
    const { close, query } = useCommandMenu();
    const threads = useOpenThreads(serverId);
    if (query.trim().length === 0 || !threads?.length) {
        return null;
    }
    return (
        <Command.Group heading="Threads">
            {threads.map((thread) => (
                <Command.Item
                    id={`thread:${thread.threadChatId}`}
                    key={thread.threadChatId}
                    {...opensPlace}
                    onAction={() => {
                        onOpen(thread);
                        close();
                    }}
                    textValue={thread.title}
                >
                    <OpenThreadGlyph state={thread.state} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-medium">{thread.title}</span>
                        <span className="truncate text-muted text-sm">
                            {openThreadStatusLine(thread)}
                        </span>
                    </span>
                </Command.Item>
            ))}
        </Command.Group>
    );
}
