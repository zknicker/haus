import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { showsHiddenFiles, WorkspaceOptionsMenu } from './chat-artifact-workspace-options-menu.tsx';

describe('workspace options menu', () => {
    test('checking "Show hidden files" turns hidden files on; unchecking turns them off', () => {
        expect(showsHiddenFiles(new Set(['hidden']))).toBe(true);
        expect(showsHiddenFiles(new Set())).toBe(false);
        expect(showsHiddenFiles('all')).toBe(true);
    });

    test('renders one trigger, and nothing when it has no sections', () => {
        const markup = renderToStaticMarkup(
            <WorkspaceOptionsMenu
                files={{ includeHidden: true, onIncludeHiddenChange: () => {}, selectedPath: null }}
            />
        );
        expect(markup.match(/aria-label="Workspace options"/g)).toHaveLength(1);
        expect(renderToStaticMarkup(<WorkspaceOptionsMenu />)).toBe('');
    });
});
