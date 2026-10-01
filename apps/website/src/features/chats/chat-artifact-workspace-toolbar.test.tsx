import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import {
    WorkspacePageRailSearch,
    WorkspacePageToolbar,
    WorkspaceRailToolbar,
} from './chat-artifact-workspace-toolbar.tsx';

describe('workspace toolbars', () => {
    test('the page toolbar groups file controls with the path', () => {
        const markup = renderToStaticMarkup(
            <WorkspacePageToolbar
                includeHidden={false}
                onIncludeHiddenChange={vi.fn()}
                selectedPath="notes/plan.md"
            >
                <span>File view controls</span>
            </WorkspacePageToolbar>
        );

        expect(markup).toContain('aria-label="Workspace tools"');
        expect(markup).toContain('border-y');
        expect(markup).not.toContain('aria-label="Back"');
        expect(markup).not.toContain('aria-label="Forward"');
        expect(markup).toContain('notes/plan.md');
        expect(markup).toContain('File view controls');
        expect(markup).not.toContain('aria-label="Search files"');
        expect(markup).toContain('aria-label="Filter files"');
        expect(markup).toContain('aria-label="File options"');
        expect(markup).not.toContain('Refresh workspace');
        expect(markup.indexOf('notes/plan.md')).toBeLessThan(markup.indexOf('File view controls'));
        expect(markup.indexOf('File view controls')).toBeLessThan(
            markup.indexOf('aria-label="Filter files"')
        );
    });

    test('a page the host already titles shows no fallback label until a file opens', () => {
        const markup = renderToStaticMarkup(
            <WorkspacePageToolbar
                includeHidden={false}
                onIncludeHiddenChange={vi.fn()}
                selectedPath={null}
                title={null}
            />
        );

        expect(markup).not.toContain('Workspace</span>');
        expect(markup).toContain('aria-label="Filter files"');
    });

    test('the panel rail keeps its compact search and filter controls', () => {
        const markup = renderToStaticMarkup(
            <WorkspaceRailToolbar
                includeHidden
                onIncludeHiddenChange={vi.fn()}
                onQueryChange={vi.fn()}
                query=""
            />
        );

        expect(markup).toContain('aria-label="Search files"');
        expect(markup).toContain('aria-label="Filter files"');
        expect(markup).not.toContain('aria-label="Back"');
    });

    test('the page file rail owns search', () => {
        const markup = renderToStaticMarkup(
            <WorkspacePageRailSearch onQueryChange={vi.fn()} query="" />
        );

        expect(markup).toContain('aria-label="Search files"');
        expect(markup).not.toContain('aria-label="Filter files"');
    });
});
