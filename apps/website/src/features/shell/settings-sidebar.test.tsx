import { expect, test } from 'bun:test';
import { Sidebar } from '@heroui-pro/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SettingsSidebar } from './settings-sidebar.tsx';

function render(backRoute: string | null) {
    return renderToStaticMarkup(
        <MemoryRouter>
            <Sidebar.Provider>
                <SettingsSidebar
                    backRoute={backRoute}
                    canOperate={false}
                    currentSection={undefined}
                    serverId="server_one"
                    slug="acme"
                />
            </Sidebar.Provider>
        </MemoryRouter>
    );
}

test('the web keeps the Settings back row; desktop (no back route) drops it for tabs and ⌘[', () => {
    expect(render('/s/acme/chats/c1')).toContain('aria-label="Back to chat"');
    const desktop = render(null);
    expect(desktop).not.toContain('Back to chat');
    expect(desktop).toContain('aria-label="Preferences"');
});
