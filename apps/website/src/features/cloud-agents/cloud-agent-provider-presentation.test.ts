import { describe, expect, test } from 'bun:test';
import type { HausDesktopBridge } from '../../lib/desktop-bridge.ts';
import {
    type CloudAgentProviderTarget,
    canOpenCloudAgentProvider,
    openCloudAgentProviderTarget,
} from './cloud-agent-provider-presentation.ts';

const deeplink = 'cursor://anysphere.cursor-deeplink/background-agent?bcId=bc%2F42';
const webPage = 'https://cursor.com/agents/bc-42';
const run: CloudAgentProviderTarget = {
    provider: 'cursor',
    providerAgentId: 'bc/42',
    providerUrl: webPage,
};

describe('opening a Cloud Agent run in its provider', () => {
    test('the desktop shell opens the provider app deeplink', async () => {
        const { bridge, opened } = desktop();
        const web: string[] = [];
        await openCloudAgentProviderTarget(run, bridge, async (url) => {
            web.push(url);
        });
        expect(opened).toEqual([deeplink]);
        expect(web).toEqual([]);
    });

    test('falls back to the web page when the provider app does not open', async () => {
        const { bridge, opened } = desktop({ rejects: true });
        const web: string[] = [];
        await openCloudAgentProviderTarget(run, bridge, async (url) => {
            web.push(url);
        });
        expect(opened).toEqual([deeplink]);
        expect(web).toEqual([webPage]);
    });

    test('surfaces the app failure when there is no web page to fall back to', async () => {
        const { bridge } = desktop({ rejects: true });
        await expect(
            openCloudAgentProviderTarget({ ...run, providerUrl: null }, bridge, async () => {})
        ).rejects.toThrow('No application');
    });

    test('web clients open the web page', async () => {
        const web: string[] = [];
        await openCloudAgentProviderTarget(run, null, async (url) => {
            web.push(url);
        });
        expect(web).toEqual([webPage]);
    });

    test('the control is available only when this client can open something', () => {
        const { bridge } = desktop();
        const appOnly = { ...run, providerUrl: null };
        expect(canOpenCloudAgentProvider(run, null)).toBe(true);
        expect(canOpenCloudAgentProvider(appOnly, bridge)).toBe(true);
        expect(canOpenCloudAgentProvider(appOnly, null)).toBe(false);
        expect(canOpenCloudAgentProvider({ ...appOnly, providerAgentId: null }, bridge)).toBe(
            false
        );
    });
});

function desktop({ rejects = false } = {}) {
    const opened: string[] = [];
    const bridge = {
        openExternal: (url: string) => {
            opened.push(url);
            return rejects ? Promise.reject(new Error('No application')) : Promise.resolve();
        },
    } as unknown as HausDesktopBridge;
    return { bridge, opened };
}
