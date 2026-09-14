import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Sidebar } from '@heroui-pro/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ChatNavigation } from './chat-navigation.tsx';
import { CommandMenuProvider } from './command-menu-provider.tsx';
import { ShellSidebar, ShellSidebarPage } from './shell-sidebar.tsx';

test('leads the Server menu with Inbox, on the menu’s own glyph column', () => {
    const markup = navigationMarkup();

    expect([...markup.matchAll(/>(Inbox|Search|Tasks)</g)].map((match) => match[1])).toEqual([
        'Inbox',
        'Search',
        'Tasks',
    ]);
    // On the web the Haus mark leads the titlebar strip, so the row carries
    // the route's own glyph instead — the same element at the same measure
    // Search and Tasks use, not an oversized box inside the icon column.
    expect(menuIconSvgTag(markup, 'inbox')).not.toContain('haus-ghost');
    expect(menuIconSvgTag(markup, 'inbox')).toEqual(menuIconSvgTag(markup, 'search'));
});

test('wears the Haus mark on the macOS desktop, where the strip has the lights', () => {
    const markup = onMacosDesktop(navigationMarkup);

    // The 22px identity-mark box overflows HeroUI's narrower icon column, the
    // same overflow the DM avatars take; the column centers it and does not
    // shrink, so the label keeps the exact x of Search and Tasks.
    expect(menuIconSvgTag(markup, 'inbox')).toContain('haus-ghost--iridescent');
    expect(markup).toContain('haus-ghost--animated');
    expect(markup).not.toContain('haus-ghost--lively');
    expect(markup).not.toContain('app-shell-titlebar-mark');
});

test('lets Inbox read at the same weight and x as Search and Tasks', () => {
    const markup = navigationMarkup();
    const inboxLabel = inboxLabelClasses(markup);

    // Inbox is an anchor, not an alert: the badge carries the urgency, so the
    // label keeps the menu's own weight rather than shouting beside it.
    expect(inboxLabel).not.toContain('font-semibold');
    expect(inboxLabel).not.toContain('font-medium');
    expect(inboxLabel).not.toContain('ms-');
});

test('badges Inbox with the Needs-you count in the Chat rows own chip', () => {
    const markup = navigationMarkup({ needsYouCount: 3 });

    expect(markup).toContain('aria-label="3 needs you"');
    // The same chip the unread counts wear, inside the row's own content, at
    // the row's natural trailing edge.
    expect(/data-sidebar="label"[^>]*>(?:(?!<\/li>).)*?3 needs you/s.test(markup)).toBe(true);
});

test('says nothing when nothing needs you', () => {
    expect(navigationMarkup({ needsYouCount: 0 })).not.toContain('needs you');
});

test('leads the sidebar with Inbox, which is the row the shell offsets', () => {
    const markup = navigationMarkup();
    const shellCss = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');

    // The offset is keyed on the position, not on a class this row carries:
    // nothing may render between the sidebar's content and Inbox, or the
    // shell would lift the wrong row onto the topbar's line. So the group has
    // to be the content's own first child, and Inbox the first row inside it.
    expect(markup.slice(markup.indexOf('data-slot="sidebar-content"'))).toMatch(
        /^data-slot="sidebar-content"[^>]*>\s*<[a-z]+[^>]*data-slot="sidebar-group"/
    );
    expect(firstMenuItemTag(markup)).toContain('data-key="inbox"');
    expect(markup.indexOf('>Inbox<')).toBeLessThan(markup.indexOf('>Search<'));
    // Nothing shares the row's line any more, so it keeps HeroUI's own end
    // padding and the gear's old reserve is gone with the gear.
    expect(markup).not.toContain('app-shell-sidebar-lead-row');
    expect(shellCss).not.toContain('app-shell-sidebar-lead-row');
    expect(shellCss).not.toContain('--app-shell-settings-gear-size');
});

/**
 * One row's icon element, stripped of its artwork: the box the glyph draws in,
 * which is what has to match across the menu.
 */
function menuIconSvgTag(markup: string, key: string): string {
    const row = markup.slice(markup.indexOf(`data-key="${key}"`));
    return /<span[^>]*data-slot="sidebar-menu-icon"[^>]*><svg[^>]*>/.exec(row)?.[0] ?? '';
}

function firstMenuItemTag(markup: string): string {
    return /<[a-z]+[^>]*data-slot="sidebar-menu-item"[^>]*>/.exec(markup)?.[0] ?? '';
}

function inboxLabelClasses(markup: string): string {
    return (
        /<span class="([^"]*)" data-sidebar="label"[^>]*><span[^>]*>Inbox</.exec(markup)?.[1] ?? ''
    );
}

function navigationMarkup(options?: { needsYouCount?: number }) {
    return renderToStaticMarkup(
        <MemoryRouter>
            <CommandMenuProvider>
                <Sidebar.Provider>
                    <ShellSidebar activePage="server" slug="dev">
                        <ShellSidebarPage ariaLabel="Server" value="server">
                            <ChatNavigation
                                agents={[]}
                                chats={[]}
                                needsYouCount={options?.needsYouCount ?? 0}
                                onCreateChannel={() => undefined}
                                onPreloadSection={() => undefined}
                                selectedChatId={undefined}
                                serverId="server_one"
                                slug="haus"
                            />
                        </ShellSidebarPage>
                    </ShellSidebar>
                </Sidebar.Provider>
            </CommandMenuProvider>
        </MemoryRouter>
    );
}

/**
 * The surface fork is driven the way the app drives it — the root class
 * `main.tsx` stamps — so the test stands up just enough document for the
 * shell's resolver to read, and takes it away again.
 */
function onMacosDesktop<T>(run: () => T): T {
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
            documentElement: {
                classList: { contains: (token: string) => token === 'macos-electron' },
            },
        },
    });
    try {
        return run();
    } finally {
        Reflect.deleteProperty(globalThis, 'document');
    }
}
