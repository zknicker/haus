import { toast } from '@heroui/react';

/**
 * Opens Linear's authorize page in a new tab with Server-minted state. The tab
 * opens inside the press so a popup blocker allows it, and is pointed at the
 * URL once the Server answers. The callback's outcome reaches this tab through
 * `linear.onUpdated`, so nothing here waits for it.
 */
export async function openLinearAuthorize(
    authorize: () => Promise<{ authorizeUrl: string }>,
    failureTitle: string
) {
    const popup = window.open('about:blank', '_blank');
    if (popup) {
        popup.opener = null;
    }
    try {
        const { authorizeUrl } = await authorize();
        if (popup) {
            popup.location.href = authorizeUrl;
        } else {
            window.open(authorizeUrl, '_blank', 'noopener,noreferrer');
        }
    } catch (error) {
        popup?.close();
        toast.danger(failureTitle, {
            description: error instanceof Error ? error.message : 'Try again shortly.',
        });
    }
}
