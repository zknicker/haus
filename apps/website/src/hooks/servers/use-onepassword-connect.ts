import type { ComputerSecretsStatus, OnePasswordVault } from '@haus/api';
import { useRef, useState } from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import {
    parseOnePasswordConnectReply,
    parseOnePasswordVaultsReply,
} from '../../lib/desktop-onepassword.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import type { ComputerSecretsTarget } from './use-computer-secrets.ts';

export type OnePasswordConnectStep =
    | { step: 'idle' }
    | { step: 'approving' }
    | { step: 'choosing'; account: string; vaults: OnePasswordVault[] }
    | { step: 'creating'; vault: OnePasswordVault }
    | { step: 'connected'; status: ComputerSecretsStatus }
    | { step: 'failed'; message: string };

/**
 * Connect 1Password: list vaults, then list the chosen vault's items and mint
 * a read-only service account through desktop main, then relay the token and
 * item list once through Server to the Computer. The token stays in this
 * function's locals; it goes through the vanilla client, not a mutation hook,
 * so React Query never caches it as mutation variables.
 */
export function useOnePasswordConnect(target: ComputerSecretsTarget, computerName: string) {
    const utils = hausTrpc.useUtils();
    const [state, setState] = useState<OnePasswordConnectStep>({ step: 'idle' });
    const attempt = useRef(0);

    const start = async () => {
        const bridge = getDesktopBridge();
        const run = ++attempt.current;
        if (!bridge?.onePasswordVaults) {
            setState({ message: 'Open Haus for Mac to connect 1Password.', step: 'failed' });
            return;
        }
        setState({ step: 'approving' });
        const reply = parseOnePasswordVaultsReply(await bridge.onePasswordVaults());
        if (run !== attempt.current) {
            return;
        }
        if (reply.status !== 'ok') {
            setState({ message: reply.message, step: 'failed' });
        } else if (reply.vaults.length === 0) {
            setState({
                message: 'No vault can be shared. Create a vault for Agents in 1Password first.',
                step: 'failed',
            });
        } else {
            setState({ account: reply.account, step: 'choosing', vaults: reply.vaults });
        }
    };

    const connect = async (account: string, vault: OnePasswordVault) => {
        const bridge = getDesktopBridge();
        const run = ++attempt.current;
        if (!bridge?.onePasswordCreateServiceAccount) {
            return;
        }
        setState({ step: 'creating', vault });
        const reply = parseOnePasswordConnectReply(
            await bridge.onePasswordCreateServiceAccount({ account, computerName, vault })
        );
        if (reply.status !== 'ok') {
            setState({ message: reply.message, step: 'failed' });
            return;
        }
        try {
            const status = await utils.client.computerSecrets.connect.mutate(
                {
                    ...target,
                    account,
                    items: reply.items,
                    serviceAccountName: reply.serviceAccountName,
                    token: reply.token,
                    vault,
                },
                // The Computer may install its Varlock runtime first; never hold a batch.
                { context: { skipBatch: true } }
            );
            void utils.computer.list.invalidate({ serverId: target.serverId });
            if (run === attempt.current) {
                setState({ status, step: 'connected' });
            }
        } catch (error) {
            setState({
                message: `${errorMessage(error)} The service account “${reply.serviceAccountName}” was created; delete it on 1password.com if you don’t retry.`,
                step: 'failed',
            });
        }
    };

    const reset = () => {
        attempt.current += 1;
        setState({ step: 'idle' });
    };

    return { connect, reset, start, state };
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Could not deliver the token to the Computer.';
}
