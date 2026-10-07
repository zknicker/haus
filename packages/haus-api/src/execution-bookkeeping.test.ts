import { expect, test } from 'bun:test';
import {
    isExecutionBookkeeping,
    isHausOnlyShellScript,
    relativizeWorkspacePath,
} from './execution-bookkeeping.ts';
import { executionBookkeepingCases } from './execution-bookkeeping-fixtures.ts';
import { unwrapShellCommand } from './execution-shell-script.ts';

for (const fixture of executionBookkeepingCases) {
    test(`bookkeeping: ${fixture.name}`, () => {
        expect(isExecutionBookkeeping(fixture)).toBe(fixture.bookkeeping);
    });
}

test('only a script of haus calls is haus-only', () => {
    expect(
        isHausOnlyShellScript(
            "haus message send --target dm:@zach <<'HAUSMSG'\nDone.\nHAUSMSG\nhaus task update --help"
        )
    ).toBe(true);
    expect(isHausOnlyShellScript('/bin/zsh -lc "env HAUS_X=1 /opt/bin/haus message check"')).toBe(
        true
    );
    expect(isHausOnlyShellScript('haus message send && curl https://x.dev')).toBe(false);
    expect(isHausOnlyShellScript('cd x; echo hi')).toBe(false);
});

test("a runtime's shell wrapper is unwrapped to the command it ran", () => {
    expect(unwrapShellCommand(`/bin/zsh -lc "pwd && sed -n '1,240p' MEMORY.md"`)).toBe(
        `pwd && sed -n '1,240p' MEMORY.md`
    );
    expect(unwrapShellCommand(`zsh -lc 'ls -la'`)).toBe('ls -la');
    expect(unwrapShellCommand('sh -c "echo hi"')).toBe('echo hi');
    expect(unwrapShellCommand('/bin/zsh -lc "haus message send --target \\"#all\\""')).toBe(
        'haus message send --target "#all"'
    );
    // `-l` alone runs a login shell on a script file, not a command line.
    expect(unwrapShellCommand('zsh -l script.sh')).toBe('zsh -l script.sh');
    expect(unwrapShellCommand('rg --files')).toBe('rg --files');
});

test('a workspace path reads relative; the home reads as ~', () => {
    const agent = '/Users/a/.haus/computer/servers/srv_1/agents/agt_1';
    expect(relativizeWorkspacePath(`${agent}/workspace/src/a.ts`)).toBe('src/a.ts');
    expect(relativizeWorkspacePath(`${agent}/workspace`)).toBe('<workspace>');
    expect(relativizeWorkspacePath(`${agent}/home/.codex/x`)).toBe('~/.codex/x');
});
