import { expect, test } from 'bun:test';
import { isModelToolNameOf, modelToolName } from './tool-catalog.ts';

test('modelToolName stays byte-identical for connections agents already hold', () => {
    expect(modelToolName('mcp_GitHubConnectn01', 'actions_run_trigger')).toBe(
        'mcp__mcp_GitHubConnectn01__actions_run_trigger_5cbb3762'
    );
    expect(modelToolName('mcp_GitHubConnectn01', 'actions_list')).toBe(
        'mcp__mcp_GitHubConnectn01__actions_list_9858e5b5'
    );
    expect(modelToolName('mcp_SkoolConnectio01', 'skool_get_lesson')).toBe(
        'mcp__mcp_SkoolConnectio01__skool_get_lesson_fd5fb198'
    );
    expect(modelToolName('connection-one', 'echo')).toBe('mcp__connection-one__echo_ccfe8f4c');
});

test('isModelToolNameOf matches only the connection prefix', () => {
    const visible = 'mcp__mcp_GitHubConnectn01__actions_list_9858e5b5';
    expect(isModelToolNameOf(visible, 'mcp_GitHubConnectn01')).toBe(true);
    expect(isModelToolNameOf(visible, 'mcp_SkoolConnectio01')).toBe(false);
    expect(isModelToolNameOf('get_me', 'mcp_GitHubConnectn01')).toBe(false);
});
