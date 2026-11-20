import {
    type ModelConnection,
    type ModelConnectionCredential,
    type ModelProvider,
    type ModelSignIn,
    type ModelSignInCancelResult,
    type ModelSignInProvider,
    modelConnectionCredentialSchema,
    modelProviderSchema,
    modelSignInProviderSchema,
} from '@haus/api';
import { TRPCClientError } from '@trpc/client';

export const modelProviderNames: Record<ModelProvider, string> = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    gemini: 'Gemini',
    openrouter: 'OpenRouter',
    xai: 'xAI',
};

export const signInProviderNames: Record<ModelSignInProvider, string> = {
    chatgpt: 'ChatGPT',
    xai: 'SuperGrok',
};

export function connectionName({
    authKind,
    provider,
}: Pick<ModelConnection, 'authKind' | 'provider'>) {
    const signInProvider = modelSignInProviderSchema.safeParse(provider);
    return authKind === 'oauth' && signInProvider.success
        ? signInProviderNames[signInProvider.data]
        : modelProviderNames[provider];
}

export function connectionInfo(connection: Pick<ModelConnection, 'authKind' | 'provider'>) {
    switch (connection.authKind) {
        case 'api-key':
            return 'A pasted API key. The Server keeps it encrypted and never shows it again.';
        case 'oauth':
            return `Signed in to ${connectionName(connection)} with a device code. The Server keeps the login encrypted and refreshes it.`;
        case 'setup-token':
            return 'A pasted setup token. The Server keeps it encrypted and never shows it again.';
    }
}

export type PastedCredentialKind = Exclude<ModelConnectionCredential['kind'], 'oauth'>;

export type ConnectFlow =
    | { choice: string; defaultLabel: string; kind: PastedCredentialKind }
    | { choice: string; defaultLabel: string; kind: 'oauth'; signInProvider: ModelSignInProvider };

export const connectFlows: Record<ModelProvider, readonly ConnectFlow[]> = {
    chatgpt: [
        {
            choice: 'ChatGPT plan',
            defaultLabel: 'ChatGPT plan',
            kind: 'oauth',
            signInProvider: 'chatgpt',
        },
    ],
    claude: [{ choice: 'Setup token', defaultLabel: 'Claude plan', kind: 'setup-token' }],
    gemini: [{ choice: 'API key', defaultLabel: 'Gemini API key', kind: 'api-key' }],
    openrouter: [{ choice: 'API key', defaultLabel: 'OpenRouter API key', kind: 'api-key' }],
    xai: [
        {
            choice: 'SuperGrok or X Premium',
            defaultLabel: 'SuperGrok',
            kind: 'oauth',
            signInProvider: 'xai',
        },
        { choice: 'API key', defaultLabel: 'xAI API key', kind: 'api-key' },
    ],
};

export interface ProviderConnections {
    connections: ModelConnection[];
    provider: ModelProvider;
}

export function connectionsByProvider(connections: readonly ModelConnection[]) {
    return modelProviderSchema.options.map(
        (provider) =>
            ({
                connections: connections
                    .filter((connection) => connection.provider === provider)
                    .sort((left, right) => left.position - right.position),
                provider,
            }) satisfies ProviderConnections
    );
}

export function connectionFact(connection: Pick<ModelConnection, 'isDefault' | 'status'>) {
    const state = connection.status === 'ready' ? 'Connected' : 'Failed';
    return connection.isDefault ? `Default · ${state}` : state;
}

export function connectionFailure(connection: Pick<ModelConnection, 'status' | 'statusDetail'>) {
    if (connection.status === 'ready') {
        return null;
    }
    return connection.statusDetail ?? 'The provider refused this connection.';
}

export type ConnectionAction = 'make-default' | 'reconnect' | 'remove' | 'rename';

export const connectionActionLabels: Record<ConnectionAction, string> = {
    'make-default': 'Make default',
    reconnect: 'Reconnect',
    remove: 'Remove',
    rename: 'Rename',
};

export function connectionActions(connection: Pick<ModelConnection, 'isDefault'>) {
    const actions: ConnectionAction[] = connection.isDefault
        ? ['rename', 'reconnect', 'remove']
        : ['rename', 'make-default', 'reconnect', 'remove'];
    return actions;
}

export function nextConnectionLabel(base: string, taken: readonly string[]) {
    const used = new Set(taken.map((label) => label.trim().toLowerCase()));
    let candidate = base;
    for (let suffix = 2; used.has(candidate.toLowerCase()); suffix += 1) {
        candidate = `${base} ${suffix}`;
    }
    return candidate;
}

export function connectLabel(
    flow: Pick<ConnectFlow, 'defaultLabel'>,
    replacing: Pick<ModelConnection, 'label'> | undefined,
    taken: readonly string[]
) {
    return replacing ? replacing.label : nextConnectionLabel(flow.defaultLabel, taken);
}

export function pastedCredential(kind: PastedCredentialKind, secret: string) {
    const parsed = modelConnectionCredentialSchema.safeParse(
        kind === 'setup-token' ? { kind, token: secret } : { key: secret, kind }
    );
    if (parsed.success) {
        return { credential: parsed.data, ok: true as const };
    }
    return {
        message: kind === 'setup-token' ? 'Paste the full setup token.' : 'Paste the full API key.',
        ok: false as const,
    };
}

export function signInCloseStep(signIn: ModelSignIn | undefined) {
    switch (signIn?.state) {
        case 'waiting-for-code':
        case 'code':
            return 'cancel' as const;
        case 'storing':
            return 'wait' as const;
        default:
            return 'close' as const;
    }
}

export function signInCancelStep(result: ModelSignInCancelResult) {
    return result.cancelled ? ('close' as const) : ('wait' as const);
}

export const runnerOfflineMessage = 'The runner is not connected. Start it and try again.';

export function connectionErrorMessage(cause: unknown) {
    if (
        cause instanceof TRPCClientError &&
        cause.data?.modelConnection?.code === 'runner-not-connected'
    ) {
        return runnerOfflineMessage;
    }
    return cause instanceof Error ? cause.message : 'Haus could not save this connection.';
}
