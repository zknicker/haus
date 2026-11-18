import { describe, expect, test } from 'bun:test';
import { resolveHausServerOrigin } from './haus-server.tsx';

describe('Haus Server origin', () => {
    test('uses the browser origin when production does not configure a separate Server', () => {
        expect(resolveHausServerOrigin(undefined, 'https://haus.chat')).toBe('https://haus.chat');
    });

    test('keeps the browser origin authoritative over development configuration', () => {
        expect(resolveHausServerOrigin('http://127.0.0.1:8090', 'https://haus.chat')).toBe(
            'https://haus.chat'
        );
    });

    test('uses explicit development configuration only when development enables it', () => {
        expect(resolveHausServerOrigin('http://127.0.0.1:8090', 'file://', true)).toBe(
            'http://127.0.0.1:8090'
        );
    });

    test('rejects the packaged App file origin without an explicit Server origin', () => {
        expect(() => resolveHausServerOrigin(undefined, 'file://')).toThrow(
            'configure VITE_HAUS_SERVER_ORIGIN'
        );
    });
});
