import { expect, test } from 'bun:test';
import { buildComputerSetupCommands } from './computer-install-command.ts';

test('builds separate install and Server setup commands', () => {
    expect(buildComputerSetupCommands('haus-hq')).toEqual({
        install: 'curl -fsSL https://releases.haus.chat/computer/install.sh | sh',
        setup: '$HOME/.local/bin/haus-computer setup /haus-hq',
    });
});
