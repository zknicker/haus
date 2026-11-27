import { expect, test } from 'bun:test';
import { invocationOperationSchema } from './agent-invocations.ts';
import { agentRepoBranch, repoFolderRequestSchema, repoNameSchema } from './repos.ts';

test('a repo is a lower-cased owner/name, .github included, and never a . or .. segment', () => {
    expect(repoNameSchema.parse(' ZKnicker/Grotto ')).toBe('zknicker/grotto');
    expect(repoNameSchema.parse('acme/.github')).toBe('acme/.github');
    expect(repoNameSchema.safeParse('grotto').success).toBe(false);
    expect(repoNameSchema.safeParse('../hooks').success).toBe(false);
    expect(repoNameSchema.safeParse('acme/.').success).toBe(false);
    expect(repoNameSchema.safeParse('owner/name/extra').success).toBe(false);
});

test('an Agent branch is haus/<agent-id>/<name>', () => {
    expect(agentRepoBranch('agt_1234567890abcdef', 'zknicker/grotto')).toBe(
        'haus/agt_1234567890abcdef/grotto'
    );
});

test('a checkout names its repo and ref, and only the Server sets its folder', () => {
    const operation = { kind: 'repo-checkout', ref: null, repository: 'ZKnicker/Grotto' } as const;
    expect(invocationOperationSchema.parse(operation)).toEqual({
        ...operation,
        repository: 'zknicker/grotto',
    });
    expect(invocationOperationSchema.safeParse({ ...operation, folder: 'relative' }).success).toBe(
        false
    );
});

test('folder requests take an absolute path', () => {
    const inspect = {
        operation: { kind: 'inspect', path: '/Users/zach/Programming/grotto' },
        requestId: 'req_1',
        type: 'repo-folder-request',
    } as const;
    expect(repoFolderRequestSchema.parse(inspect)).toEqual(inspect);
    expect(
        repoFolderRequestSchema.safeParse({
            ...inspect,
            operation: { kind: 'inspect', path: 'grotto' },
        }).success
    ).toBe(false);
});
