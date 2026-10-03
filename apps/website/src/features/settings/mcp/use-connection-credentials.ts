import { isMcpBearerTokenPreset, type McpBearerTokenPreset } from '@haus/api';
import { useState } from 'react';
import { useConnectionHeadersUpdate } from '../../../hooks/servers/use-connection-headers-update.ts';
import { useConnectionPresetAdd } from '../../../hooks/servers/use-connection-preset-add.ts';
import { useConnectionTokenUpdate } from '../../../hooks/servers/use-connection-token-update.ts';
import { toConnectionView } from './connection-view.tsx';
import type { McpConnection } from './mcp-server-shared.ts';
import type { ConnectionSignIn } from './use-connection-sign-in.ts';

/** Which credentials form is open over the connection page. */
export type CredentialsEditor = 'account-token' | 'headers' | 'token';

/** Credentials held back until the Agents losing access are confirmed. */
type PendingCredentials =
    | { bearerToken: string; kind: 'token' }
    | { headers: Record<string, string>; kind: 'headers' };

/**
 * Saving a connection's credentials and adding another account of its preset.
 * A bearer-token preset (X) takes a pasted token instead of generic headers or
 * an OAuth sign-in, so its replace and add-account paths open the token form.
 * An OAuth preset's new account is created and signed in from the one press,
 * and `onAccountCreated` moves the reader to it.
 * Replacing credentials that Agents rely on waits for `requestConfirmation`'s
 * dialog to call `confirmPending`.
 */
export function useConnectionCredentials({
    connection,
    onAccountCreated,
    requestConfirmation,
    serverId,
    signIn,
}: {
    connection: McpConnection | null;
    onAccountCreated: (connection: McpConnection) => void;
    requestConfirmation: () => void;
    serverId: string;
    signIn: Pick<ConnectionSignIn, 'beginCreated'>;
}) {
    const addPreset = useConnectionPresetAdd(serverId);
    const replaceHeaders = useConnectionHeadersUpdate(serverId);
    const replaceToken = useConnectionTokenUpdate(serverId);
    const [editor, setEditor] = useState<CredentialsEditor | null>(null);
    const [pending, setPending] = useState<PendingCredentials | null>(null);
    const preset = connection?.preset ?? null;
    const tokenPreset: McpBearerTokenPreset | null = isMcpBearerTokenPreset(preset) ? preset : null;

    const save = async (credentials: PendingCredentials) => {
        if (!connection) {
            return;
        }
        const target = { connectionId: connection.id, serverId };
        await (credentials.kind === 'token'
            ? replaceToken.mutateAsync({ ...target, bearerToken: credentials.bearerToken })
            : replaceHeaders.mutateAsync({ ...target, headers: credentials.headers }));
    };
    const replace = async (credentials: PendingCredentials) => {
        if (connection && connection.affectedAgents.length > 0) {
            setPending(credentials);
            setEditor(null);
            requestConfirmation();
            return;
        }
        await save(credentials);
        setEditor(null);
    };

    return {
        /** Adds another account of this connection's preset. */
        addAccount: () => {
            if (!(connection && preset)) {
                return;
            }
            const name = `${connection.name} account`;
            if (isMcpBearerTokenPreset(preset)) {
                setEditor('account-token');
            } else if (connection.auth === 'oauth') {
                signIn.beginCreated(
                    async () =>
                        toConnectionView(await addPreset.mutateAsync({ name, preset, serverId })),
                    onAccountCreated
                );
            } else {
                addPreset.mutate({ name, preset, serverId });
            }
        },
        closeEditor: () => setEditor(null),
        confirmPending: () => {
            if (pending) {
                void save(pending).catch(() => undefined);
            }
            setPending(null);
        },
        editor,
        /** Opens the form that adds or replaces this connection's credentials. */
        editCredentials: () => setEditor(tokenPreset ? 'token' : 'headers'),
        saveHeaders: (headers: Record<string, string>) => replace({ headers, kind: 'headers' }),
        saveToken: async (bearerToken: string) => {
            if (editor === 'account-token' && connection && tokenPreset) {
                await addPreset.mutateAsync({
                    bearerToken,
                    name: `${connection.name} account`,
                    preset: tokenPreset,
                    serverId,
                });
                setEditor(null);
                return;
            }
            await replace({ bearerToken, kind: 'token' });
        },
        saving: addPreset.isPending || replaceHeaders.isPending || replaceToken.isPending,
        tokenPreset,
    };
}
