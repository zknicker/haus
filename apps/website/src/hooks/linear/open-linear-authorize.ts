import { toast } from '@heroui/react';
import type { ProviderTab } from '../provider-return/use-provider-tab.ts';

/**
 * Points a provider tab, begun inside the press, at Linear's authorize page
 * once the Server mints its state. The callback lands back on the Linear page
 * with `?linear_setup=`, which the provider tab hands to the tab that started
 * the install (`use-provider-tab.ts`); `linear.onUpdated` refreshes the data.
 */
export async function openLinearAuthorize(
    tab: ProviderTab,
    authorize: () => Promise<{ authorizeUrl: string }>,
    failureTitle: string
) {
    try {
        const { authorizeUrl } = await authorize();
        tab.go(authorizeUrl);
    } catch (error) {
        tab.cancel();
        toast.danger(failureTitle, {
            description: error instanceof Error ? error.message : 'Try again shortly.',
        });
    }
}
