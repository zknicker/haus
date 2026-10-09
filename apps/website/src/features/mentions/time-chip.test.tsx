import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { ReferenceMarkdown } from './reference-markdown.tsx';
import { formatTimeChipLabel } from './time-chip-format.ts';

const sentAt = '2026-10-09T16:00:00Z';
// Before the viewer's saved zone loads, the chip reads in this device's zone.
const deviceLabel = formatTimeChipLabel(new Date('2026-10-10T19:00:00Z'), {
    viewerZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

test('prose times with a zone render as chips in the viewer zone', () => {
    const markup = render(
        <ReferenceMarkdown content="Standup moves to **tomorrow at 3 PM ET**." sentAt={sentAt} />
    );
    expect(markup).toContain('reference-chip');
    expect(markup).toContain(`aria-label="Preview ${deviceLabel}"`);
    expect(markup).not.toContain('tomorrow at 3 PM ET');
});

test('code, blockquotes, zoneless times, and unsent text stay plain', () => {
    const content = [
        'Run `cron 3 PM ET` at 3 PM.',
        '',
        '> They said tomorrow at 3 PM ET.',
        '',
        '```',
        'tomorrow at 3 PM ET',
        '```',
    ].join('\n');
    const markup = render(<ReferenceMarkdown content={content} sentAt={sentAt} />);
    expect(markup).not.toContain('reference-chip');
    expect(markup).toContain('They said tomorrow at 3 PM ET.');
    expect(render(<ReferenceMarkdown content="tomorrow at 3 PM ET" />)).not.toContain(
        'reference-chip'
    );
});

function render(children: ReactNode) {
    const queryClient = new QueryClient();
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                {children}
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
