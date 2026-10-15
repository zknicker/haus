import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { WidgetArtifactCard } from './artifact-card.tsx';
import { ArtifactPanelOpenProvider } from './artifact-panel-context.tsx';

test('renders a stock ItemCard with the HTML kind icon, title, and Page with file name', () => {
    const markup = renderToStaticMarkup(
        <WidgetArtifactCard props={{ path: 'workbench/pages/fleet.html', title: 'Fleet status' }} />
    );

    expect(markup).toContain('item-card--message-object');
    expect(markup).toContain('Fleet status');
    expect(markup).toContain('Page · fleet.html');
    expect(markup).toContain('--artifact-kind-html');
    expect(markup).not.toContain('workbench/pages');
    expect(markup).not.toContain('card-shell');
    expect(markup).not.toContain('<iframe');
});

test('names the file once when it is the title', () => {
    const markup = renderToStaticMarkup(
        <WidgetArtifactCard props={{ path: 'workbench/pages/fleet.html' }} />
    );

    expect(markup).toContain('fleet.html');
    expect(markup).not.toContain('Page · fleet.html');
});

test('is inert outside a Workspace pane context', () => {
    const markup = renderToStaticMarkup(
        <WidgetArtifactCard props={{ path: 'workbench/pages/fleet.html' }} />
    );

    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('tabindex');
});

test('is one labeled button inside a Workspace pane context', () => {
    const markup = renderToStaticMarkup(
        <ArtifactPanelOpenProvider agentId="agent_1" onOpen={() => undefined}>
            <WidgetArtifactCard props={{ path: 'workbench/pages/fleet.html', title: 'Fleet' }} />
        </ArtifactPanelOpenProvider>
    );

    expect(markup.match(/<button/gu)).toHaveLength(1);
    expect(markup).toContain('aria-label="Open Fleet"');
    expect(markup).toContain('type="button"');
});
