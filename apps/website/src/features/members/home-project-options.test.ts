import { expect, test } from 'bun:test';
import type { Project } from '@haus/api';
import { homeProjectOptions } from './home-project-options.ts';

test('New Captain offers only live Projects, never #all or an archived one', () => {
    expect(
        homeProjectOptions([
            project({ chatId: 'cht_archive', name: 'archive', archived: true }),
            project({ chatId: 'cht_all', name: 'all', isHaus: true }),
            project({ chatId: 'cht_product', name: 'product' }),
        ])
    ).toEqual([{ id: 'cht_product', label: '#product' }]);
});

function project(overrides: Partial<Project> & Pick<Project, 'chatId' | 'name'>): Project {
    return {
        archived: false,
        homeAgentIds: [],
        isHaus: false,
        key: 'PROD',
        keyEditable: true,
        serverId: 'srv_one',
        taskKeyId: 'tky_one',
        ...overrides,
    };
}
