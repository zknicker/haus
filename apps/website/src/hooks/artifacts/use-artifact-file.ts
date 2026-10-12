import { useState } from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { useArtifactDownload } from './use-artifacts.ts';

export function useArtifactFile(serverId: string, artifactId: string, revisionId: string) {
    const download = useArtifactDownload(serverId, artifactId, revisionId);
    const [opening, setOpening] = useState(false);
    const [openError, setOpenError] = useState<string | null>(null);
    async function openFile() {
        const desktop = getDesktopBridge();
        const tab = desktop ? null : window.open('about:blank', '_blank');
        if (tab) {
            tab.opener = null;
        }
        setOpening(true);
        setOpenError(null);
        try {
            const fresh = await download.refetch();
            if (!fresh.data || fresh.error) {
                throw fresh.error ?? new Error('File unavailable.');
            }
            if (desktop) {
                await desktop.openExternal(fresh.data.download_url);
            } else if (tab) {
                tab.location.href = fresh.data.download_url;
            } else {
                throw new Error('Allow pop-ups to open this file.');
            }
        } catch (error) {
            tab?.close();
            setOpenError(error instanceof Error ? error.message : 'Could not open the file.');
        } finally {
            setOpening(false);
        }
    }
    return { download, opening, openError, openFile };
}
