import { toast } from '@heroui/react';
import { useState } from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { getHausServerOrigin, hausTrpc } from '../../lib/haus-server.tsx';

/**
 * Downloads files and folders as one zip (`artifact.zip`). The Server checks
 * the selection and its size cap first, then hands back a short-lived link
 * that streams the archive; the browser's download manager saves it (and can
 * cancel it), and the desktop hands it to the system browser, as single-file
 * downloads do. A refused selection (too large, gone) shows as a toast.
 */
export function useArtifactZipDownload(serverId: string) {
    const utils = hausTrpc.useUtils();
    const [preparing, setPreparing] = useState(false);

    async function downloadZip(selection: { paths: readonly string[]; root: string }) {
        setPreparing(true);
        try {
            const link = await utils.client.artifact.zip.mutate({
                paths: [...selection.paths],
                root: selection.root,
                serverId,
            });
            const url = new URL(link.zip_path, getHausServerOrigin()).toString();
            const desktop = getDesktopBridge();
            if (desktop) {
                await desktop.openExternal(url);
            } else {
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.rel = 'noopener';
                anchor.click();
            }
        } catch (error) {
            toast.danger('Could not download these files', {
                description: error instanceof Error ? error.message : undefined,
            });
        } finally {
            setPreparing(false);
        }
    }

    return { downloadZip, preparing };
}
