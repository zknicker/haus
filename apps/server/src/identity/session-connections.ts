export interface SessionConnection {
    close(): void;
    expiresAt: number;
    key: object;
    onClose(listener: () => void): () => void;
    sessionId: string;
}

interface ActiveConnection extends SessionConnection {
    clearExpiry: () => void;
    detach: () => void;
    expire: () => void;
}

/** Tracks live App sockets and SSE responses so expiry and local sign-out end them immediately. */
export class SessionConnections {
    private readonly byConnection = new WeakMap<object, ActiveConnection>();
    private readonly bySession = new Map<string, Set<ActiveConnection>>();

    track(connection: SessionConnection) {
        const existing = this.byConnection.get(connection.key);
        if (existing) {
            if (existing.sessionId !== connection.sessionId) {
                existing.close();
                existing.detach();
                return;
            }
            this.arm(existing, connection.expiresAt);
            return;
        }

        const active: ActiveConnection = {
            ...connection,
            clearExpiry: () => undefined,
            detach: () => undefined,
            expire: () => {
                active.close();
                active.detach();
            },
        };
        let removeCloseListener: () => void = () => undefined;
        active.detach = () => {
            active.clearExpiry();
            this.byConnection.delete(active.key);
            const connections = this.bySession.get(active.sessionId);
            connections?.delete(active);
            if (connections?.size === 0) {
                this.bySession.delete(active.sessionId);
            }
            removeCloseListener();
        };
        removeCloseListener = connection.onClose(active.detach);
        const sessionConnections = this.bySession.get(connection.sessionId) ?? new Set();
        sessionConnections.add(active);
        this.bySession.set(connection.sessionId, sessionConnections);
        this.byConnection.set(connection.key, active);
        this.arm(active, connection.expiresAt);
    }

    renew(sessionId: string, expiresAt: number) {
        for (const connection of this.bySession.get(sessionId) ?? []) {
            this.arm(connection, expiresAt);
        }
    }

    revoke(sessionId: string) {
        for (const connection of [...(this.bySession.get(sessionId) ?? [])]) {
            connection.close();
            connection.detach();
        }
    }

    private arm(connection: ActiveConnection, expiresAt: number) {
        connection.clearExpiry();
        connection.expiresAt = expiresAt;
        const timer = setTimeout(connection.expire, Math.max(0, expiresAt - Date.now()));
        connection.clearExpiry = () => clearTimeout(timer);
    }
}
