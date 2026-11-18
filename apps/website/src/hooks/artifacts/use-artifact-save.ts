import { toast } from '@heroui/react';
import { useState } from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * Downloads one revision as a file through a freshly signed link (a cached
 * link may already have expired). The link carries
 * `Content-Disposition: attachment`, so the browser saves it instead of
 * rendering it and the page stays put; the desktop hands it to the system
 * browser, which saves it the same way.
 */
export function useArtifactSave(serverId: string) {
    const utils = hausTrpc.useUtils();
    const [saving, setSaving] = useState(false);

    async function saveFile(target: { artifactId: string; revisionId: string }) {
        setSaving(true);
        try {
            const { download_url } = await utils.client.artifact.download.query({
                artifact_id: target.artifactId,
                revision_id: target.revisionId,
                save: true,
                serverId,
            });
            const desktop = getDesktopBridge();
            if (desktop) {
                await desktop.openExternal(download_url);
            } else {
                const anchor = document.createElement('a');
                anchor.href = download_url;
                anchor.rel = 'noopener';
                anchor.click();
            }
        } catch (error) {
            toast.danger('Could not download the file', {
                description: error instanceof Error ? error.message : undefined,
            });
        } finally {
            setSaving(false);
        }
    }

    return { saveFile, saving };
}
