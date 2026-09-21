import { expect, test } from 'bun:test';
import { browserSaveInput } from './use-browser-save.ts';

test('Browser saves retain the selected Server and Computer route', () => {
    expect(
        browserSaveInput(
            {
                computerId: 'cmp_selected000000',
                serverId: 'srv_selected000000',
            },
            {
                enabled: true,
                connection: {
                    applicationPath: '/Applications/Google Chrome.app',
                    userDataDir: '/shared',
                },
            }
        )
    ).toEqual({
        computerId: 'cmp_selected000000',
        serverId: 'srv_selected000000',
        settings: {
            enabled: true,
            connection: {
                applicationPath: '/Applications/Google Chrome.app',
                userDataDir: '/shared',
            },
        },
    });
});
