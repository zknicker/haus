import assert from 'node:assert/strict';
import test from 'node:test';
import { relativizeWorkspacePath } from '@haus/api';
import { readTracePath } from './turn-trace-path.ts';

const agent =
    '/Users/zknicker/.haus/dev/cnreview/computer/servers/srv_WaQNQzGWyLYyqZDE/agents/agt_5Pu8v37EEX9Jrmsa';

test('P0-5: a sub-agent host path reads workspace-relative, filename first', () => {
    assert.deepEqual(readTracePath(`${agent}/workspace/projects/tinylink/src/shorten.ts`), {
        dir: 'projects/tinylink/src',
        name: 'shorten.ts',
        path: 'projects/tinylink/src/shorten.ts',
    });
    assert.equal(relativizeWorkspacePath(`${agent}/workspace`), '<workspace>');
});

test('the Agent home reads as ~ and other paths stay as they are', () => {
    assert.equal(
        readTracePath(`${agent}/home/.codex/skills/.system/imagegen/SKILL.md`).dir,
        '~/.codex/skills/.system/imagegen'
    );
    assert.deepEqual(readTracePath('MEMORY.md'), { dir: '', name: 'MEMORY.md', path: 'MEMORY.md' });
    assert.deepEqual(readTracePath('/etc/hosts'), {
        dir: '/etc',
        name: 'hosts',
        path: '/etc/hosts',
    });
    assert.deepEqual(readTracePath('/hosts'), { dir: '/', name: 'hosts', path: '/hosts' });
});
