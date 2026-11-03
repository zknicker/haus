import { afterAll, expect, mock, test } from 'bun:test';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Bun keeps module mocks registered for the rest of the worker even after
// mock.restore(), so later test files resolve whatever this file leaves in
// the registry. Copy the real module first, stub on top of it so the mock
// stays a complete module, and re-register the real exports after the
// target import below has linked against the stubs.
const actualHausServer = { ...(await import('../../lib/haus-server.tsx')) };

mock.module('../../lib/haus-server.tsx', () => ({
    ...actualHausServer,
    HausServerProvider: ({ children }: React.PropsWithChildren) => (
        <div data-testid="haus-server-provider">{children}</div>
    ),
    hausTrpc: {
        server: {
            developmentBootstrap: {
                useMutation: () => ({ mutate: () => undefined }),
            },
        },
        useUtils: () => ({
            server: {
                invalidate: () => undefined,
            },
        }),
    },
}));

mock.module('../auth/sign-in-gate.tsx', () => ({
    SignInGate: ({ children }: React.PropsWithChildren) => (
        <div data-testid="sign-in-gate">{children}</div>
    ),
}));

mock.module('./server-event-listeners.tsx', () => ({
    ServerEventListeners: () => <div data-testid="server-event-listeners" />,
}));

const { HausServerRoutes } = await import('./haus-server-routes.tsx');
mock.restore();

// Registering a module mock patches already-loaded modules immediately, so
// the real exports can only go back once this file's tests are done — but
// before later files in the worker resolve the module.
afterAll(() => {
    mock.module('../../lib/haus-server.tsx', () => actualHausServer);
});

test('mounts authenticated Server state inside the sign-in gate', () => {
    const markup = renderToStaticMarkup(<HausServerRoutes />);

    expect(markup).toContain(
        '<div data-testid="sign-in-gate"><div data-testid="haus-server-provider">'
    );
    expect(markup).toContain('server-event-listeners');
});
