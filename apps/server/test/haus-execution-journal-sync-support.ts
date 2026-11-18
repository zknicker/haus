import { createHash } from 'node:crypto';

import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';

import type { HausServerHarness } from './haus-server-harness.ts';

export function bootstrapFrame(credential: string) {
    return {
        architecture: 'arm64',
        bootstrapProtocolVersion: computerBootstrapProtocolVersion,
        credential,
        health: 'healthy',
        operatingSystem: 'darwin',
        productVersion: '9.4.0',
        protocolVersion: computerProtocolVersion,
        type: 'bootstrap',
        update: {
            detail: null,
            phase: 'idle',
            targetVersion: null,
            updatedAt: '2026-10-09T12:00:00.000Z',
        },
    };
}

export function digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export function computerSocketUrl(harness: HausServerHarness): URL {
    const url = new URL('/computer/attachment', harness.url);
    url.protocol = 'ws:';
    return url;
}
