/**
 * The App ↔ Server wire contract. This is intentionally an exact
 * equality gate: a changed contract requires an App update, never an adapter.
 */
export const appProtocolVersion = 7;

export const appProtocolHeaders = {
    productVersion: 'x-haus-product-version',
    protocolVersion: 'x-haus-app-protocol-version',
} as const;
