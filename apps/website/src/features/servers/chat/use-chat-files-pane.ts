import * as React from 'react';
import { setChatSidePane, useChatSidePane } from '../../../hooks/pane/use-chat-side-pane.ts';
import { useDesktopWorkspaceTabs } from '../../../hooks/workspace-tabs/use-desktop-workspace-tabs.ts';

/**
 * Where a chat's Files open. Desktop opens (or selects) the chat's Files
 * workspace tab. The website shares the chat side panel with the artifact and
 * thread panes; the latest opener wins the slot, and closing hands the slot
 * back to the artifact pane.
 */
export function useChatFilesPane(chatId: string) {
    const openFilesTab = useDesktopWorkspaceTabs()?.openFiles;
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

/** Desktop (an `openFilesTab`): the chat's Files tab. Website: the chat side panel. */
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
