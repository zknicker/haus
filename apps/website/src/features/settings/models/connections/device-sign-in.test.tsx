import { expect, test } from 'bun:test';
import type { ModelSignIn } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeviceSignInStatus } from './device-sign-in.tsx';

const base = {
    expiresAt: '2026-11-19T12:15:00.000Z',
    label: 'ChatGPT plan',
    provider: 'chatgpt' as const,
    signInId: 'msi_1',
};

function text(signIn: ModelSignIn) {
    return renderToStaticMarkup(<DeviceSignInStatus signIn={signIn} />)
        .replaceAll(/<[^>]+>/gu, '')
        .replaceAll('&#x27;', "'");
}

test('each step of a sign-in reads as what the Owner waits for or does next', () => {
    expect(text({ ...base, state: 'waiting-for-code' })).toBe('Waiting for a code from ChatGPT…');
    expect(text({ ...base, provider: 'xai', state: 'waiting-for-code' })).toBe(
        'Waiting for a code from SuperGrok…'
    );
    expect(text({ ...base, state: 'storing' })).toBe('Saving the connection…');
    expect(text({ ...base, connectionId: 'mcn_1', state: 'connected' })).toBe(
        'ChatGPT plan is connected.'
    );
    expect(text({ ...base, detail: 'The code expired.', state: 'failed' })).toBe(
        'The code expired.'
    );
    expect(text({ ...base, state: 'cancelled' })).toBe('Sign-in cancelled.');
});

test('the code step shows the link and the code to type, with a copy button', () => {
    const html = renderToStaticMarkup(
        <DeviceSignInStatus
            signIn={{
                ...base,
                provider: 'xai',
                state: 'code',
                userCode: 'WXYZ-1234',
                verificationUri: 'https://accounts.x.ai/device',
            }}
        />
    );
    expect(html).toContain('accounts.x.ai/device');
    expect(html).toContain('>WXYZ-1234<');
    expect(html).toContain('aria-label="Copy code"');
    expect(html).toContain('This closes once SuperGrok confirms.');
});
