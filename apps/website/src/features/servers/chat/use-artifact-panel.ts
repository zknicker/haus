import * as React from 'react';
import { setChatSidePane, useChatSidePane } from '../../../hooks/pane/use-chat-side-pane.ts';
import type { ChatArtifactPanelState } from '../../chats/chat-artifact-panel-state.ts';
import {
    getArtifactPanelTargetKey,
    type HausResourceTarget,
    isWorkspaceChatPaneTarget,
} from '../../chats/haus-resource-link.ts';

export function useChatArtifactPanel(chatId: string): ChatArtifactPanelState {
    const activeSidePane = useChatSidePane(chatId);
    const [visible, setVisible] = React.useState(false);
    const [pane, setPane] = React.useState<ArtifactPaneState>({
        activeKey: null,
        targets: [],
    });

    const open = React.useCallback(
        (target: HausResourceTarget) => {
            if (!(isWorkspaceChatPaneTarget(target) && target.agentId)) {
                return;
            }
            setChatSidePane(chatId, 'artifact');
            setVisible(true);
            setPane((current) => mergeArtifactTarget(current, target));
        },
        [chatId]
    );
    const closeTarget = React.useCallback((key: string) => {
        setPane((current) => closeArtifactTarget(current, key));
    }, []);
    const setActiveKey = React.useCallback((key: string) => {
        setPane((current) =>
            current.targets.some((target) => getArtifactPanelTargetKey(target) === key)
                ? { ...current, activeKey: key }
                : current
        );
    }, []);
    const toggleVisible = React.useCallback(() => {
        setVisible((current) => {
            if (!current || activeSidePane !== 'artifact') {
                setChatSidePane(chatId, 'artifact');
                return true;
            }
            return false;
        });
    }, [activeSidePane, chatId]);

    return {
        ...pane,
        closeTarget,
        open,
        setActiveKey,
        toggleVisible,
        visible: visible && activeSidePane === 'artifact',
    };
}

interface ArtifactPaneState {
    activeKey: string | null;
    targets: HausResourceTarget[];
}

export function mergeArtifactTarget(
    current: ArtifactPaneState,
    target: HausResourceTarget
): ArtifactPaneState {
    const key = getArtifactPanelTargetKey(target);
    if (current.targets.some((candidate) => getArtifactPanelTargetKey(candidate) === key)) {
        return current.activeKey === key ? current : { ...current, activeKey: key };
    }

    if (isWorkspaceChatPaneTarget(target)) {
        const workspaceIndex = current.targets.findIndex(
            (candidate) =>
                isWorkspaceChatPaneTarget(candidate) && candidate.agentId === target.agentId
        );
        const workspaceTarget = current.targets[workspaceIndex];
        if (workspaceTarget) {
            if (target.kind !== 'workspaceFile') {
                return {
                    ...current,
                    activeKey: getArtifactPanelTargetKey(workspaceTarget),
                };
            }
            return {
                activeKey: key,
                targets: current.targets.map((candidate, index) =>
                    index === workspaceIndex ? target : candidate
                ),
            };
        }
    }

    return { activeKey: key, targets: [...current.targets, target] };
}

function closeArtifactTarget(current: ArtifactPaneState, key: string): ArtifactPaneState {
    const closingIndex = current.targets.findIndex(
        (target) => getArtifactPanelTargetKey(target) === key
    );
    if (closingIndex === -1) {
        return current;
    }
    const targets = current.targets.filter((target) => getArtifactPanelTargetKey(target) !== key);
    if (current.activeKey !== key) {
        return { ...current, targets };
    }
    const activeTarget = targets.at(Math.min(closingIndex, targets.length - 1));
    return {
        activeKey: activeTarget ? getArtifactPanelTargetKey(activeTarget) : null,
        targets,
    };
}
