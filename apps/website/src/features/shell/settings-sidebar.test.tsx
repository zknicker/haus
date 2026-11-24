import { expect, test } from 'bun:test';
import { Sidebar } from '@heroui-pro/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SettingsSidebar } from './settings-sidebar.tsx';

function render(backRoute: string) {
    return renderToStaticMarkup(
        <MemoryRouter>
            <Sidebar.Provider>
                <SettingsSidebar
                    backRoute={backRoute}
                    canOperate={false}
                    currentSection={undefined}
                    slug="acme"
                />
            </Sidebar.Provider>
        </MemoryRouter>
    );
}

test('Settings leads with a Back to chat row on every surface', () => {
    const html = render('/s/acme/chats/c1');
    expect(html).toContain('aria-label="Back to chat"');
    expect(html).toContain('aria-label="Preferences"');
});
