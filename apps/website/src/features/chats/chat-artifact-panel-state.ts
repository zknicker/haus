import type { HausResourceTarget } from './haus-resource-link.ts';

export interface ChatArtifactPanelState {
    activeKey: string | null;
    closeTarget: (key: string) => void;
    open: (target: HausResourceTarget) => void;
    setActiveKey: (key: string) => void;
    targets: HausResourceTarget[];
    toggleVisible: () => void;
    visible: boolean;
}
