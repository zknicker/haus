import { createHash } from 'node:crypto';

interface McpRequest {
    controller: AbortController;
    expiresAt: number;
    started: boolean;
}

/** Explicit cancellation also works when Bun's HTTP compatibility layer omits close events. */
export class McpRequests {
    private readonly entries = new Map<string, McpRequest>();

    begin(token: string, requestId: string) {
        const key = this.key(token, requestId);
        const entry = this.getOrCreate(key);
        if (entry.started) {
            throw new Error('An MCP request id cannot be reused.');
        }
        entry.started = true;
        return { signal: entry.controller.signal, dispose: () => this.entries.delete(key) };
    }

    cancelExisting(token: string, requestId: string): boolean {
        const entry = this.entries.get(this.key(token, requestId));
        if (!entry) {
            return false;
        }
        entry.controller.abort();
        return true;
    }

    cancel(token: string, requestId: string) {
        this.getOrCreate(this.key(token, requestId)).controller.abort();
    }

    close() {
        for (const entry of this.entries.values()) {
            entry.controller.abort();
        }
        this.entries.clear();
    }

    private getOrCreate(key: string) {
        const now = Date.now();
        for (const [id, entry] of this.entries) {
            if (entry.expiresAt <= now) {
                entry.controller.abort();
                this.entries.delete(id);
            }
        }
        const existing = this.entries.get(key);
        if (existing) {
            return existing;
        }
        if (this.entries.size >= 4096) {
            throw new Error('The MCP request capacity is temporarily exhausted.');
        }
        const entry = {
            controller: new AbortController(),
            expiresAt: now + 65_000,
            started: false,
        };
        this.entries.set(key, entry);
        return entry;
    }

    private key(token: string, requestId: string) {
        return `${createHash('sha256').update(token).digest('hex')}:${requestId}`;
    }
}
