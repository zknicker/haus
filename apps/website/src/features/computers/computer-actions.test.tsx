import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComputerRemovalAction, RecoveryCommands } from './computer-actions.tsx';

test('Recovery commands are visible in a copyable code block', () => {
    const html = renderToStaticMarkup(<RecoveryCommands serverSlug="dev" />);

    expect(html).toContain('Recovery Commands');
    expect(html.match(/data-slot="code-block"/g)).toHaveLength(1);
    expect(html).toContain('# Check whether each Server attachment is stopped or running');
    expect(html).toContain('# Check local files and Server credential acceptance');
    expect(html).toContain('# Restart this attachment if it stops responding');
    expect(html).toContain('# Restore the previous verified Computer release');
    expect(html).toContain('haus-computer status');
    expect(html).toContain('haus-computer doctor');
    expect(html).toContain('haus-computer restart /dev');
    expect(html).toContain('haus-computer upgrade --rollback');
    expect(html).not.toContain('View Commands');
    expect(html).not.toContain('role="dialog"');
});

test('Computer removal stays disabled while an Agent remains assigned', () => {
    const html = renderToStaticMarkup(
        <ComputerRemovalAction
            availability={{ agentNames: ['Cove'], status: 'blocked' }}
            onRemove={() => undefined}
        />
    );

    expect(html).toContain('Permanently remove this Computer. All Agents must be deleted first.');
    expect(html).toContain('aria-label="Delete Cove before removing this Computer."');
    expect(html).toContain('disabled=""');
});

test('Computer removal becomes available after every Agent is deleted', () => {
    const html = renderToStaticMarkup(
        <ComputerRemovalAction availability={{ status: 'ready' }} onRemove={() => undefined} />
    );

    expect(html).toContain('Permanently remove this Computer. All Agents must be deleted first.');
    expect(html).not.toContain('disabled=""');
});
