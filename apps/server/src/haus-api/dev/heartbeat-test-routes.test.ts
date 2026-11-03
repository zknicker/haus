import { expect, test } from 'bun:test';
import { assertHeartbeatTestAllowed } from './heartbeat-test-routes.ts';

test('heartbeat test routes need a development lifecycle, not just a localhost Host header', () => {
    expect(() => assertHeartbeatTestAllowed('localhost:3000', false)).toThrow(
        'available only in development'
    );
    expect(() => assertHeartbeatTestAllowed('localhost:3000', true)).not.toThrow();
    expect(() => assertHeartbeatTestAllowed('haus.example.com', true)).toThrow(
        'only from localhost'
    );
});
