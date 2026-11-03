export interface RefreshRefusedSessionOptions {
    readAccessToken: () => Promise<string | null>;
    reconnect: () => void;
    refreshAppSession: () => Promise<void>;
    refreshSession: (token: string) => Promise<void>;
}

/** Re-reads a short Haus session after the Server refuses a socket operation. */
export async function refreshRefusedSession({
    readAccessToken,
    reconnect,
    refreshAppSession,
    refreshSession,
}: RefreshRefusedSessionOptions): Promise<boolean> {
    await refreshAppSession();
    const token = await readAccessToken();
    if (!token) {
        return false;
    }
    try {
        await refreshSession(token);
    } catch {
        reconnect();
    }
    return true;
}
