import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import {
    WorkspacePageRailSearch,
    WorkspacePageToolbar,
    WorkspaceRailToolbar,
} from './chat-artifact-workspace-toolbar.tsx';

describe('workspace toolbars', () => {
    test('the page toolbar is one page bar: path, file controls, then one menu', () => {
        const markup = renderToStaticMarkup(
            <WorkspacePageToolbar
                includeHidden={false}
                onIncludeHiddenChange={vi.fn()}
                selectedPath="notes/plan.md"
            >
                <span>File view controls</span>
            </WorkspacePageToolbar>
        );

        expect(markup).toContain('class="page-toolbar');
        expect(markup).not.toContain('border-y');
        expect(markup).toContain('aria-label="Workspace tools"');
        expect(markup).toContain('notes/plan.md');
        expect(markup).toContain('File view controls');
        expect(markup).not.toContain('aria-label="Search files"');
        expect(markup).not.toContain('aria-label="Filter files"');
        expect(markup.match(/aria-label="Workspace options"/g)).toHaveLength(1);
        expect(markup.indexOf('notes/plan.md')).toBeLessThan(markup.indexOf('File view controls'));
        expect(markup.indexOf('File view controls')).toBeLessThan(
            markup.indexOf('aria-label="Workspace options"')
        );
    });

    test('a host breadcrumb replaces the path label', () => {
        const markup = renderToStaticMarkup(
            <WorkspacePageToolbar
                includeHidden={false}
                leading={<nav>Forge trail</nav>}
                onIncludeHiddenChange={vi.fn()}
                selectedPath="MEMORY.md"
            />
        );

        expect(markup).toContain('Forge trail');
        expect(markup).not.toContain('title="MEMORY.md"');
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
        expect(markup).toContain('aria-label="Workspace options"');
    });

    test('an unbrowsable workspace keeps the bar but drops the file menu', () => {
        const bare = renderToStaticMarkup(
            <WorkspacePageToolbar leading="Forge" selectedPath={null} title={null} />
        );
        expect(bare).toContain('Forge');
        expect(bare).not.toContain('aria-label="Workspace options"');

        const withHost = renderToStaticMarkup(
            <WorkspacePageToolbar
                leading="Forge"
                menuSections={<span>Agent sections</span>}
                selectedPath={null}
                title={null}
            />
        );
        expect(withHost).toContain('aria-label="Workspace options"');
    });

    test('a band-placed bar portals into the shell band and never draws its own row', () => {
        // Without a mounted band slot (static render) the portal has nowhere
        // to land, so nothing renders in place: no stacked page-toolbar row.
        const markup = renderToStaticMarkup(
            <WorkspacePageToolbar
                includeHidden={false}
                leading={<nav>Forge trail</nav>}
                onIncludeHiddenChange={vi.fn()}
                placement="band"
                selectedPath="MEMORY.md"
            />
        );

        expect(markup).toBe('');
    });

    test('a column-placed bar draws the band chrome in place, not a page-toolbar row', () => {
        const markup = renderToStaticMarkup(
            <WorkspacePageToolbar
                includeHidden={false}
                leading={<nav>Forge trail</nav>}
                onIncludeHiddenChange={vi.fn()}
                placement="column"
                selectedPath="MEMORY.md"
            >
                <span>File view controls</span>
            </WorkspacePageToolbar>
        );

        expect(markup).toContain('app-shell-band h-[var(--app-shell-band-height)]');
        expect(markup).not.toContain('page-toolbar');
        expect(markup).toContain('Forge trail');
        expect(markup).toContain('File view controls');
        expect(markup.match(/aria-label="Workspace options"/g)).toHaveLength(1);
    });

    test('a rail beside a column bar stands its search on the band line', () => {
        const markup = renderToStaticMarkup(
            <WorkspacePageRailSearch onBandLine onQueryChange={vi.fn()} query="" />
        );

        expect(markup).toContain('h-[var(--app-shell-band-height)]');
        expect(markup).toContain('aria-label="Search files"');
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
