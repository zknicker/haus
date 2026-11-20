import { afterAll, expect, test } from 'bun:test';
import * as React from 'react';
import { installFakeDom } from '../../../test-support/fake-dom.ts';

const restoreDom = installFakeDom();
afterAll(restoreDom);

const { useBackgroundUpload } = await import('./use-background-upload.tsx');
const { getThemeBackground } = await import('../../../hooks/shell/use-theme-background.ts');
const { createRoot } = await import('react-dom/client');
const { act } = React;

let upload: ReturnType<typeof useBackgroundUpload> | null = null;

function UploadProbe({ theme }: { theme: 'gruvbox' | 'nord' }) {
    upload = useBackgroundUpload(theme);
    return <p>{upload.error ?? 'clear'}</p>;
}

function pick(file: File) {
    upload?.input.props.onChange({ target: { files: [file], value: file.name } });
}

test('an upload error belongs to the theme it was raised under', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(() => root.render(<UploadProbe theme="nord" />));

    await act(() => pick(new File(['notes'], 'notes.txt', { type: 'text/plain' })));
    expect(container.textContent).not.toBe('clear');

    await act(() => root.render(<UploadProbe theme="gruvbox" />));
    expect(container.textContent).toBe('clear');
    await act(() => root.render(<UploadProbe theme="nord" />));
    expect(container.textContent).toBe('clear');
    await act(() => root.unmount());
});

test('a save that finishes after the theme changed touches neither theme', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(() => root.render(<UploadProbe theme="nord" />));
    const before = getThemeBackground('nord');

    act(() => {
        pick(new File([new Uint8Array(16)], 'lake.png', { type: 'image/png' }));
        root.render(<UploadProbe theme="gruvbox" />);
    });
    await act(() => new Promise((settled) => setImmediate(settled)));
    await act(() => root.render(<UploadProbe theme="nord" />));
    expect(container.textContent).toBe('clear');
    expect(getThemeBackground('nord')).toEqual(before);
    await act(() => root.unmount());
});
