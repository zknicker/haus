import { expect, test } from 'bun:test';

import { assertDevTestRouteAllowed } from './dev-test-route-guard.ts';

test('dev test routes need a development lifecycle, not just a localhost Host header', () => {
    expect(() => assertDevTestRouteAllowed('localhost:3000', false)).toThrow(
        'available only in development'
    );
    expect(() => assertDevTestRouteAllowed('localhost:3000', true)).not.toThrow();
    expect(() => assertDevTestRouteAllowed('haus.example.com', true)).toThrow(
        'only from localhost'
    );
});
