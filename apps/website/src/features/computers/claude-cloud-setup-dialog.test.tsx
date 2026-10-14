import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClaudeCloudSetupDialog, claudeCloudSetupScript } from './claude-cloud-setup-dialog.tsx';

test('native environment script downloads the Python installer without a bootstrap credential', () => {
    const script = claudeCloudSetupScript('https://haus.example.com/');
    expect(script).toContain('set -e');
    expect(script).toContain("'https://haus.example.com/api/cloud-agents/claude-hooks'");
    expect(script).toContain("python3 /tmp/haus-cloud-hook.py install 'https://haus.example.com'");
    expect(script).not.toContain('X-Haus-Cloud-Bootstrap');
    expect(script).not.toContain('Authorization');
});

test('setup rendering never publishes the one-time credential as DOM text or an input', () => {
    const token = 'synthetic-test-credential-never-render';
    const html = renderToStaticMarkup(
        <ClaudeCloudSetupDialog
            computerId="cmp_test"
            isChecking={false}
            onClose={() => undefined}
            onRecheck={() => undefined}
            ready={false}
            setup={{
                serverOrigin: 'https://haus.example.com',
                headerName: 'X-Haus-Cloud-Bootstrap',
                token,
            }}
        />
    );
    expect(html).not.toContain(token);
    expect(html).not.toContain('type="password"');
});
