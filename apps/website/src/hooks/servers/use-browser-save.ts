import type { AgentRuntimeSaveBrowserSettings } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import type { BrowserTarget } from './use-browser-settings.ts';

export function useBrowserSave(target: BrowserTarget) {
    const utils = hausTrpc.useUtils();

    return hausTrpc.browser.save.useMutation({
        onSuccess: () => utils.browser.get.invalidate(target),
    });
}

export function browserSaveInput(target: BrowserTarget, settings: AgentRuntimeSaveBrowserSettings) {
    return { ...target, settings };
}
