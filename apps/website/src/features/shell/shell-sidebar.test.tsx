import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Sidebar } from '@heroui-pro/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ShellSidebar, ShellSidebarPage, ShellSidebarPageContent } from './shell-sidebar.tsx';
import { SidebarBackToChatRow, SidebarSettingsAction } from './sidebar-settings-action.tsx';

test('renders only the active sidebar page so route changes are instant', () => {
    const markup = renderToStaticMarkup(
        <MemoryRouter>
            <Sidebar.Provider>
                <ShellSidebar activePage="server" slug="dev">
                    <ShellSidebarPage ariaLabel="Server" value="server">
                        Server
                    </ShellSidebarPage>
                    <ShellSidebarPage ariaLabel="Tasks" value="tasks">
                        Tasks
                    </ShellSidebarPage>
                    {null}
                </ShellSidebar>
            </Sidebar.Provider>
        </MemoryRouter>
    );

    expect(markup).toContain('aria-label="Server"');
    expect(markup).toContain('Server');
    expect(markup).not.toContain('Tasks');
});

test('keeps shared footer presentation outside the active sidebar page', () => {
    const markup = renderToStaticMarkup(
        <MemoryRouter>
            <Sidebar.Provider>
                <ShellSidebar
                    activePage="tasks"
                    footer="Working"
                    settingsAction="Settings"
                    slug="dev"
                >
                    <ShellSidebarPage ariaLabel="Server" value="server">
                        Server
                    </ShellSidebarPage>
                    <ShellSidebarPage ariaLabel="Tasks" value="tasks">
                        Tasks
                    </ShellSidebarPage>
                </ShellSidebar>
            </Sidebar.Provider>
        </MemoryRouter>
    );

    expect(markup).toContain('Tasks');
    expect(markup).toContain('Settings');
    expect(markup).toContain('Working');
});

test('seats Settings in the titlebar strip on a plain document, above the navigation', () => {
    const markup = renderToStaticMarkup(
        <MemoryRouter>
            <Sidebar.Provider>
                <ShellSidebar
                    activePage="tasks"
                    footer="Working"
                    settingsAction="Settings"
                    slug="dev"
                >
                    <ShellSidebarPage ariaLabel="Tasks" value="tasks">
                        Tasks
                    </ShellSidebarPage>
                </ShellSidebar>
            </Sidebar.Provider>
        </MemoryRouter>
    );

    // No `macos-electron` root class here: the web reserves the same strip, so
    // the gear rides in it there too, rendered where it is drawn — above the
    // navigation and the footer, not inside either.
    const footerStart = markup.indexOf('data-slot="sidebar-footer"');
    expect(markup.indexOf('Settings')).toBeLessThan(footerStart);
    const footer = markup.slice(footerStart);
    expect(footer).toContain('Working');
    expect(footer).not.toContain('Settings');
});

test('leaves the footer to its own contents while the gear rides the strip', () => {
    const markup = renderToStaticMarkup(
        <MemoryRouter>
            <Sidebar.Provider>
                <ShellSidebar activePage="tasks" settingsAction="Settings" slug="dev">
                    <ShellSidebarPage ariaLabel="Tasks" value="tasks">
                        Tasks
                    </ShellSidebarPage>
                </ShellSidebar>
            </Sidebar.Provider>
        </MemoryRouter>
    );

    // The footer slot stays wired as the gear's other home, but nothing mounts
    // a footer with nothing in it.
    expect(markup).not.toContain('data-slot="sidebar-footer"');
    expect(markup).toContain('Settings');
});

test('stands a sidebar page on its own navigation, with no header band', () => {
    const markup = renderToStaticMarkup(
        <MemoryRouter>
            <Sidebar.Provider>
                <Sidebar>
                    <ShellSidebarPageContent>Content</ShellSidebarPageContent>
                </Sidebar>
            </Sidebar.Provider>
        </MemoryRouter>
    );

    expect(markup).toContain('data-slot="sidebar-content"');
    // The band element is gone: the lead navigation row itself stands in the
    // shell band, so nothing above it approximates the topbar's midline.
    expect(markup).not.toContain('data-slot="sidebar-header"');
});

test('leads the web strip with the Haus mark, ahead of the gear', () => {
    const markup = sidebarMarkup();
    const strip = markup.slice(markup.indexOf('app-shell-titlebar-strip'));

    // Leading end first, trailing end second: the strip is one line, so DOM
    // order is reading order.
    expect(strip.indexOf('app-shell-titlebar-mark')).toBeLessThan(strip.indexOf('Settings'));
    expect(markup).toContain('haus-ghost--iridescent');
    // Outside an activity provider the Server reads as quiet, so the mesh
    // still drifts but keeps the calm tempo.
    expect(markup).toContain('haus-ghost--animated');
    expect(markup).not.toContain('haus-ghost--lively');
    // A destination, not decoration: the mark is the way back to the Inbox,
    // so it is a real link with a real name and the ghost inside it stays
    // decorative. A real link earns a real tab stop; nothing suppresses it.
    // The name is the product mark, not the destination: the Inbox navigation
    // row sits 40px below with the same href, and two adjacent tab stops both
    // called "Inbox" is one name too many.
    const mark = strip.slice(0, strip.indexOf('Settings'));
    expect(mark).toMatch(/<a [^>]*aria-label="Haus"/);
    expect(mark).toContain('href="/s/dev/inbox"');
    expect(mark).toContain('aria-hidden="true"');
    expect(mark).not.toContain('tabindex="-1"');
});

test('leaves the macOS desktop strip to the traffic lights and the gear', () => {
    const markup = onMacosDesktop(sidebarMarkup);
    const strip = markup.slice(markup.indexOf('app-shell-titlebar-strip'));

    // The lights already lead that line, so nothing of ours does. The mark
    // stays down on the Inbox row, which is the navigation's business.
    expect(strip).not.toContain('app-shell-titlebar-mark');
    expect(markup).not.toContain('haus-ghost');
    expect(strip).toContain('Settings');
});

test('offsets the sidebar’s first navigation row onto the shell band’s midline', () => {
    const shellCss = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
    const lead =
        /\.app-shell\s+\[data-slot='sidebar-content'\]\s+>\s+\[data-slot='sidebar-group'\]:first-child\s+\[data-slot='sidebar-menu-item'\]:first-child\s*\{([^}]*)\}/.exec(
            shellCss
        )?.[1];

    // A top offset of half the band, derived from HeroUI's own row box, not a
    // full band around the row: standing the row in a band centred it but left
    // the band's lower half as a gap before the next row.
    expect(lead?.replace(/\s+/gu, ' ')).toContain(
        'margin-block-start: calc( (var(--app-shell-band-height) - var(--spacing) * 9) / 2 )'
    );
    expect(lead).not.toContain('min-height');
    // The sidebar's top padding is the titlebar strip and nothing else, so the
    // offset starts at the sidebar's content top on every surface.
    expect(shellCss).toContain('padding-block-start: var(--app-shell-titlebar-inset);');
    expect(shellCss).not.toMatch(/padding-block-start:\s*calc\(\s*var\(--spacing\)/);
    // Every surface reserves the strip, so it floats unconditionally; only the
    // token's value is declared per platform.
    expect(shellCss).toMatch(
        /\n\s*\.app-shell \[data-slot='sidebar'\] \.app-shell-titlebar-strip\s*\{[^}]*position:\s*absolute/
    );
    expect(shellCss).not.toMatch(/html\.macos-electron[^{]*\.app-shell-titlebar-strip\s*\{/);
    // The mark lands on the navigation's icon column, and the strip is
    // end-justified so a lone gear cannot drift to the leading edge on the
    // surface that has no mark.
    expect(shellCss).toContain('calc(var(--spacing-compact) * 3 + 8px)');
    expect(shellCss).toMatch(/\.app-shell-titlebar-strip\s*\{[^}]*justify-content:\s*flex-end/);
    // Nothing left to clear: the mark never sits beside the lights, so the
    // gutter token went with the rule that read it.
    expect(shellCss).not.toContain('--app-shell-traffic-light-gutter');
    // Both declaration sites stand: the web's plain scope, and the macOS one
    // that owns the traffic-light arithmetic behind the same value.
    expect(shellCss).toMatch(/\n\s*\.app-shell \{\s*--app-shell-titlebar-inset:/);
    expect(shellCss).toMatch(
        /html\.macos-electron \.app-shell \{[\s\S]*?--app-shell-titlebar-inset:/
    );
});

test('renders back navigation with the shared sidebar menu anatomy', () => {
    const markup = renderToStaticMarkup(
        <MemoryRouter>
            <Sidebar.Provider>
                <Sidebar>
                    <SidebarBackToChatRow route="/s/dev/chats/general" />
                </Sidebar>
            </Sidebar.Provider>
        </MemoryRouter>
    );

    expect(markup).toContain('data-slot="sidebar-menu-item"');
    expect(markup).toContain('data-slot="sidebar-menu-icon"');
    expect(markup).toContain('data-slot="sidebar-menu-label"');
    expect(markup).toContain('>Back</span>');
    expect(markup).not.toContain('Back to chat</span>');
});

test('floats Settings as the sidebar\u2019s only chrome, with no row of its own', () => {
    const markup = renderToStaticMarkup(
        <MemoryRouter>
            <Sidebar.Provider>
                <Sidebar>
                    <SidebarSettingsAction
                        onOpenSettings={() => undefined}
                        onPreloadSettings={() => undefined}
                    />
                </Sidebar>
            </Sidebar.Provider>
        </MemoryRouter>
    );

    expect(markup).toContain('aria-label="Settings"');
    // The action owns the button and none of its placement, so it carries no
    // positioning class of its own — the strip or the footer places it.
    expect(markup).not.toContain('app-shell-titlebar');
    // No row of its own on any surface: the titlebar strip, or the footer line
    // it would share with live Agent activity.
    expect(markup).not.toContain('app-shell-settings-band');
    expect(markup).not.toContain('data-slot="sidebar-menu-item"');
    expect(markup).not.toContain('Switch Server');
});

/**
 * The surface fork is driven the way the app drives it — the root class
 * `main.tsx` stamps — so the test stands up just enough document for the
 * resolver to read, and takes it away again.
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

function sidebarMarkup() {
    return renderToStaticMarkup(
        <MemoryRouter>
            <Sidebar.Provider>
                <ShellSidebar activePage="tasks" settingsAction="Settings" slug="dev">
                    <ShellSidebarPage ariaLabel="Tasks" value="tasks">
                        Tasks
                    </ShellSidebarPage>
                </ShellSidebar>
            </Sidebar.Provider>
        </MemoryRouter>
    );
}
