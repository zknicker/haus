import { expect, test } from 'bun:test';
import { ContextMenu } from '@heroui-pro/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DmContextMenuItems } from './chat-context-menu-items.tsx';

function render(peer: 'agent' | 'person') {
    return renderToStaticMarkup(
        <ContextMenu.Menu aria-label="DM">
            <DmContextMenuItems files={false} hasAgent={false} hasChat peer={peer} />
        </ContextMenu.Menu>
    );
}

test("a person's DM offers no Captain profile; an Agent's DM keeps it", () => {
    expect(render('person')).not.toContain('View Captain profile');
    expect(render('agent')).toContain('View Captain profile');
});
