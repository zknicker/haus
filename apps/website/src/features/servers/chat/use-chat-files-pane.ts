import * as React from 'react';

import { useDesktopPageOpeners } from '../../../hooks/desktop-tabs/use-desktop-page-openers.ts';
import { setChatSidePane, useChatSidePane } from '../../../hooks/pane/use-chat-side-pane.ts';

export function useChatFilesPane(chatId: string) {
    const openFilesTab = useDesktopPageOpeners()?.openFiles;
    const activeSidePane = useChatSidePane(chatId);
    const [visible, setVisible] = React.useState(false);

    const open = React.useCallback(() => {
        routeChatFilesOpen(chatId, {
            openFilesTab,
            openPanel: () => {
                setChatSidePane(chatId, 'files');
                setVisible(true);
            },
        });
    }, [chatId, openFilesTab]);
    const close = React.useCallback(() => {
        setVisible(false);
        setChatSidePane(chatId, 'artifact');
    }, [chatId]);

    return {
        close,
        open,
        visible: visible && activeSidePane === 'files',
    };
}

/** Desktop (an `openFilesTab`): the chat's Attachments tab. Website: the chat side panel. */
export function routeChatFilesOpen(
    chatId: string,
    {
        openFilesTab,
        openPanel,
    }: { openFilesTab: ((chatId: string) => void) | undefined; openPanel: () => void }
) {
    if (openFilesTab) {
        openFilesTab(chatId);
    } else {
        openPanel();
    }
}
