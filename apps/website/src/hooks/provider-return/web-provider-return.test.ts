import { describe, expect, test } from 'bun:test';
import {
    announceWebProviderReturn,
    awaitWebProviderReturn,
    type ReturnChannel,
} from './web-provider-return.ts';

/** Same-origin tabs sharing one channel name: a post reaches every other open end. */
function channelHub() {
    const ends = new Set<ReturnChannel & { closed: boolean }>();
    const open = () => {
        const end: ReturnChannel & { closed: boolean } = {
            close: () => {
                end.closed = true;
                ends.delete(end);
            },
            closed: false,
            onmessage: null,
            postMessage: (message) => {
                queueMicrotask(() => {
                    for (const other of [...ends]) {
                        if (other !== end) {
                            other.onmessage?.({ data: structuredClone(message) });
                        }
                    }
                });
            },
        };
        ends.add(end);
        return end;
    };
    return { ends, open };
}

const landed = '/s/acme/settings/connections/mcp_1?linear_setup=workspace_connected';

describe('web provider return', () => {
    test('the starting tab claims the landing and shows it; the landing may close', async () => {
        const hub = channelHub();
        const shown: string[] = [];
        awaitWebProviderReturn(
            { serverPath: '/s/acme', show: (path) => shown.push(path) },
            hub.open()
        );
        expect(await announceWebProviderReturn(landed, hub.open())).toBe(true);
        expect(shown).toEqual([landed]);
        // Both ends let go: one flow, one return.
        expect(hub.ends.size).toBe(0);
    });

    test('a landing nobody started stays in place', async () => {
        const hub = channelHub();
        expect(await announceWebProviderReturn(landed, hub.open(), 20)).toBe(false);
    });

    test("another Server's landing is not claimed", async () => {
        const hub = channelHub();
        const shown: string[] = [];
        awaitWebProviderReturn(
            { serverPath: '/s/other', show: (path) => shown.push(path) },
            hub.open()
        );
        expect(await announceWebProviderReturn(landed, hub.open(), 20)).toBe(false);
        expect(shown).toEqual([]);
    });
});
