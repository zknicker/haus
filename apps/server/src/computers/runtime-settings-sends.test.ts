import { expect, test } from 'bun:test';
import type { AgentCommand, ServerRuntimeSettingsCommand } from '@haus/api';
import { RuntimeSettingsSends } from './runtime-settings-sends.ts';

const on: ServerRuntimeSettingsCommand = { idleCompaction: true, type: 'server-runtime-settings' };
const off: ServerRuntimeSettingsCommand = {
    idleCompaction: false,
    type: 'server-runtime-settings',
};

function transport() {
    const sent: string[] = [];
    const describe = (frame: AgentCommand) =>
        frame.type === 'server-runtime-settings' ? String(frame.idleCompaction) : frame.type;
    return {
        sent,
        transport: {
            send: (computerId: string, frame: AgentCommand) => {
                sent.push(`${computerId}:${describe(frame)}`);
                return true;
            },
            sendToServer: (serverId: string, frame: AgentCommand) => {
                sent.push(`${serverId}:${describe(frame)}`);
                return 1;
            },
        },
    };
}

test('an attach read that started before a change never reaches the Computer after it', async () => {
    const { sent, transport: sends } = transport();
    const queue = new RuntimeSettingsSends(sends);
    const staleRead = Promise.withResolvers<ServerRuntimeSettingsCommand>();
    const attach = queue.attached('server-1', 'computer-1', () => staleRead.promise);
    // The Owner turns it off while the attach read is still in flight.
    const change = queue.changed('server-1', () => Promise.resolve(off));
    await Bun.sleep(5);
    staleRead.resolve(on);
    await Promise.all([attach, change]);
    expect(sent).toEqual(['computer-1:true', 'server-1:false']);
});

test('an attach while every setting is off sends nothing', async () => {
    const { sent, transport: sends } = transport();
    await new RuntimeSettingsSends(sends).attached('server-1', 'computer-1', () =>
        Promise.resolve(off)
    );
    expect(sent).toEqual([]);
});

test('a failed read rejects its own send and never blocks the next one', async () => {
    const { sent, transport: sends } = transport();
    const queue = new RuntimeSettingsSends(sends);
    const failed = queue.attached('server-1', 'computer-1', () =>
        Promise.reject(new Error('database down'))
    );
    const change = queue.changed('server-1', () => Promise.resolve(on));
    await expect(failed).rejects.toThrow('database down');
    await change;
    expect(sent).toEqual(['server-1:true']);
});
