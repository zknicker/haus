import { Button } from '@heroui/react';
import * as React from 'react';
import { useBrowserViewBounds } from '../../hooks/browser/use-browser-view-bounds.ts';
import type { BrowserTab } from '../../lib/desktop-browser.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { BrowserWorkspaceToolbar } from './browser-workspace-toolbar.tsx';

export function BrowserWorkspacePage() {
    const workspace = useBrowserWorkspace();
    const tab = workspace?.state.tabs.find((item) => item.id === workspace.state.activeId);
    return tab ? <BrowserPage key={tab.id} tab={tab} /> : null;
}

function BrowserPage({ tab }: { tab: BrowserTab }) {
    const host = React.useRef<HTMLDivElement>(null);
    useBrowserViewBounds(host, tab.error !== null || tab.url === 'about:blank');
    return (
        <section
            aria-label={`Browser: ${tab.title}`}
            className="absolute inset-0 z-10 flex flex-col bg-background"
        >
            <BrowserWorkspaceToolbar tab={tab} />
            <div className="min-h-0 flex-1" ref={host}>
                {tab.error ? (
                    <p className="p-6 text-muted text-sm" role="alert">
                        {tab.error}. Reload or open this page in your default browser.
                    </p>
                ) : null}
                {tab.url === 'about:blank' ? <BrowserStartPage /> : null}
            </div>
        </section>
    );
}

function BrowserStartPage() {
    const workspace = useBrowserWorkspace();
    return (
        <div className="mx-auto mt-24 max-w-lg px-6">
            <p className="text-muted text-sm">Search the web or enter a website address above.</p>
            {workspace?.history.length ? (
                <section aria-label="Suggested pages" className="mt-6 flex flex-wrap gap-3">
                    {workspace.history.slice(0, 6).map((entry) => (
                        <Button
                            key={entry.url}
                            onPress={() =>
                                workspace.command({
                                    kind: 'navigate',
                                    action: 'url',
                                    url: entry.url,
                                })
                            }
                            variant="ghost"
                        >
                            <span className="max-w-40 truncate">{entry.title}</span>
                        </Button>
                    ))}
                </section>
            ) : null}
        </div>
    );
}
