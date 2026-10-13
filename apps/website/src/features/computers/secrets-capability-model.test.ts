import { describe, expect, test } from 'bun:test';
import type { ComputerSecretsStatus } from '@haus/api';
import { secretsCapabilityView } from './secrets-capability-model.ts';

const notConnected: ComputerSecretsStatus = { connected: false, provider: '1password' };
const connected: ComputerSecretsStatus = {
    account: 'my.1password.com',
    connected: true,
    connectedAt: '2026-10-13T12:00:00.000Z',
    issue: null,
    items: [{ envName: 'DUMMY_API_KEY', title: 'Dummy API Key' }],
    itemsRefreshedAt: '2026-10-13T12:00:00.000Z',
    provider: '1password',
    serviceAccountName: 'Haus Computer Mac mini 2026-10-13',
    vault: { id: 'vaultid0000000000000000001', name: 'Agents' },
};

describe('secretsCapabilityView', () => {
    test('offers Connect only on the desktop App for an online Computer', () => {
        expect(
            secretsCapabilityView({
                canUseOnePassword: true,
                isOffline: false,
                status: notConnected,
            })
        ).toMatchObject({ canConnect: true, status: 'not-connected' });
        expect(
            secretsCapabilityView({
                canUseOnePassword: false,
                isOffline: false,
                status: notConnected,
            })
        ).toMatchObject({ canConnect: false, status: 'not-connected' });
        expect(
            secretsCapabilityView({
                canUseOnePassword: true,
                isOffline: true,
                status: notConnected,
            })
        ).toMatchObject({ canConnect: false, status: 'unavailable' });
    });

    test('a Computer that never reported secrets asks for an update', () => {
        expect(
            secretsCapabilityView({ canUseOnePassword: true, isOffline: false, status: null })
        ).toMatchObject({
            canConnect: false,
            description: 'Update this Computer to connect a 1Password vault.',
        });
    });

    test('connected names the vault and item count, and keeps it while offline', () => {
        const online = secretsCapabilityView({
            canUseOnePassword: false,
            isOffline: false,
            status: connected,
        });
        expect(online).toMatchObject({ canDisconnect: true, canRefresh: false, status: 'ready' });
        expect(online.description).toContain('“Agents” (1 item)');
        expect(
            secretsCapabilityView({ canUseOnePassword: true, isOffline: true, status: connected })
        ).toMatchObject({ canDisconnect: false, canRefresh: false, status: 'ready' });
    });

    test('Refresh items needs the desktop App and an online Computer', () => {
        expect(
            secretsCapabilityView({ canUseOnePassword: true, isOffline: false, status: connected })
        ).toMatchObject({ canDisconnect: true, canRefresh: true });
    });

    test('a connected Computer without its Varlock runtime needs attention', () => {
        expect(
            secretsCapabilityView({
                canUseOnePassword: true,
                isOffline: false,
                status: { ...connected, issue: 'runtime-missing' },
            })
        ).toMatchObject({
            canRefresh: true,
            status: 'needs-attention',
            statusLabel: 'Needs attention',
        });
    });

    test('a locked Keychain asks someone to log in on the Computer', () => {
        expect(
            secretsCapabilityView({
                canUseOnePassword: true,
                isOffline: false,
                status: { ...connected, issue: 'keychain-locked' },
            })
        ).toMatchObject({
            description: "This Computer's Keychain is locked. Log in on the Computer to unlock it.",
            status: 'needs-attention',
            statusLabel: 'Keychain locked',
        });
    });
});
