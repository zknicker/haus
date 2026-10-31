import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const workflowPath = join(repoRoot, '.github/workflows/deploy-haus-server.yml');

test('promotes a published Haus version through an explicit dispatch or protected release call', () => {
    const source = readFileSync(workflowPath, 'utf8');
    const workflow = parse(source) as {
        concurrency: { 'cancel-in-progress': boolean; group: string };
        jobs: {
            deploy: {
                env: Record<string, string>;
                permissions: { contents: string };
                steps: {
                    'continue-on-error'?: boolean;
                    env?: Record<string, string>;
                    if?: string;
                    name?: string;
                    run?: string;
                    uses?: string;
                    with?: Record<string, unknown>;
                }[];
                'runs-on': string[];
            };
        };
        on: {
            workflow_call: {
                inputs: {
                    mode: { required: boolean; type: string };
                    source_revision: { required: boolean; type: string };
                    version: { required: boolean; type: string };
                };
                secrets: {
                    GH_DEPLOY_AGENT_PRODUCTION_OP_TOKEN: { required: boolean };
                };
            };
            workflow_dispatch: {
                inputs: {
                    mode: { options: string[]; required: boolean; type: string };
                    source_revision: { required: boolean; type: string };
                    version: { required: boolean; type: string };
                };
            };
        };
    };

    // Release may call the same protected production operation that remains
    // available through an explicit manual dispatch.
    expect(Object.keys(workflow.on)).toEqual(['workflow_call', 'workflow_dispatch']);
    expect(workflow.on.workflow_call).toMatchObject({
        inputs: {
            mode: { required: true, type: 'string' },
            source_revision: { required: true, type: 'string' },
            version: { required: true, type: 'string' },
        },
        secrets: { GH_DEPLOY_AGENT_PRODUCTION_OP_TOKEN: { required: true } },
    });
    expect(workflow.on.workflow_dispatch.inputs).toMatchObject({
        mode: { options: ['deploy', 'activate'], required: true, type: 'choice' },
        source_revision: { required: false, type: 'string' },
        version: { required: true, type: 'string' },
    });
    expect(workflow.concurrency).toEqual({
        'cancel-in-progress': false,
        group: 'haus-production',
    });

    const job = workflow.jobs.deploy;
    const commands = job.steps.flatMap((step) => step.run ?? []).join('\n');
    const resolveCommands =
        job.steps.find((step) => step.name === 'Resolve published version')?.run ?? '';
    const deployCommands =
        job.steps.find((step) => step.name === 'Deploy downloaded release')?.run ?? '';
    const verifyCommands =
        job.steps.find((step) => step.name === 'Verify installed release')?.run ?? '';
    const migrationStep = job.steps.find((step) => step.name === 'Apply database migrations');
    const renderStep = job.steps.find((step) => step.name === 'Render the Server environment');
    const checkoutStep = job.steps.find(
        (step) => step.name === 'Check out the environment contract'
    );
    expect(job['runs-on']).toEqual(['self-hosted', 'haus']);
    expect(job.permissions).toEqual({ contents: 'read' });
    expect(source).toContain('/Users/zknicker/srv/haus');
    expect(commands).toContain('.published_at');
    expect(commands).toContain('/git/ref/tags/');
    expect(commands).toContain('/git/tags/');
    expect(resolveCommands).not.toContain('/releases/assets/');
    expect(resolveCommands).not.toContain('haus-server-');
    expect(deployCommands).toContain('/releases/assets/');
    expect(deployCommands).toContain('application/octet-stream');
    expect(deployCommands).toContain('/usr/bin/shasum -a 256 -c');
    expect(deployCommands).toContain('./bin/haus-server-deploy');
    expect(deployCommands).toContain('/bin/haus-server-deploy');
    expect(verifyCommands).not.toContain('/releases/assets/');
    expect(verifyCommands).toContain('verify-haus-server-release.ts');
    const installedReleasePath = [
        '$',
        '{HAUS_DEPLOY_ROOT}/releases/',
        '$',
        '{HAUS_SOURCE_REVISION}',
    ].join('');
    expect(verifyCommands).toContain(installedReleasePath);

    // The environment contract travels with the repository, not the artifact.
    // Checking out the released revision instead would make the first varlock
    // deploy impossible — that release predates the schema — and would break
    // every rollback to one. The checkout takes the workflow's own revision,
    // with full history so the render step can read the released revision's
    // Server environment module and prove the two contracts agree.
    expect(checkoutStep?.uses).toBe('actions/checkout@v4');
    expect(checkoutStep?.with?.ref).toBeUndefined();
    expect(checkoutStep?.with?.['fetch-depth']).toBe(0);
    expect(renderStep?.run).toContain('--source-revision');

    // Every production value resolves from the schema. The only platform-held
    // secret is the deploy agent's bootstrap token, and it fills the schema's
    // production role slot rather than naming a credential.
    for (const step of [renderStep, migrationStep]) {
        expect(step?.env?.VARLOCK_ENV).toBe('production');
        expect(step?.env?.DEPLOY_AGENT_PRODUCTION_OP_TOKEN).toContain(
            'secrets.GH_DEPLOY_AGENT_PRODUCTION_OP_TOKEN'
        );
    }
    expect(renderStep?.run).toContain('bun scripts/render-server-env.ts');

    // Resolution is the deploy's only network dependency, and a transient
    // 1Password 502 has failed a healthy deploy at this step. Rendering is
    // idempotent, so it retries; the migration mutates the database, so it must
    // not.
    expect(renderStep?.run).toContain('until bunx varlock');
    expect(renderStep?.run).toContain('attempt');
    expect(renderStep?.run).toMatch(/-ge 3/u);
    expect(renderStep?.run).toContain('giving up');
    expect(migrationStep?.run).not.toContain('until ');
    expect(migrationStep?.run).toContain('/bin/haus-server-migrate');
    expect(migrationStep?.run).toContain('Database: ✅');
    expect(migrationStep?.run).toContain('release was not activated');

    // The migration credential is no longer a repository secret, and the deploy
    // agent's bootstrap token is the only one that remains.
    expect(source).not.toContain('secrets.HAUS_DATABASE_MIGRATION_URL');
    const workflowSecrets = new Set(
        [...source.matchAll(/secrets\.([A-Z][A-Z0-9_]*)/gu)].map((match) => match[1])
    );
    expect([...workflowSecrets]).toEqual(['GH_DEPLOY_AGENT_PRODUCTION_OP_TOKEN']);

    // Verify, render, migrate, then activate.
    expect(commands.indexOf('verify-haus-server-release')).toBeLessThan(
        commands.indexOf('render-server-env')
    );
    expect(commands.indexOf('render-server-env')).toBeLessThan(
        commands.indexOf('/bin/haus-server-migrate')
    );
    expect(commands.indexOf('/bin/haus-server-migrate')).toBeLessThan(
        commands.indexOf('/usr/local/libexec/haus/activate-haus-server')
    );
    expect(commands).toContain('/usr/bin/sudo -n /usr/local/libexec/haus/activate-haus-server');
    expect(deployCommands.indexOf('/usr/bin/shasum -a 256 -c')).toBeLessThan(
        deployCommands.indexOf('./bin/haus-server-deploy')
    );
    expect(commands).toContain("trap 'cleanup' EXIT");
    expect(commands).toContain('/usr/bin/trash');
    expect(commands).not.toContain('git fetch');
    expect(commands).not.toContain('git reset');
    expect(commands).not.toContain('git clean');
    expect(commands).not.toContain('release:check');
    expect(commands).not.toContain('VITE_CLERK_PUBLISHABLE_KEY');
    expect(commands).not.toContain('--env-file');
    expect(commands).not.toContain('bootstrap:haus');
    expect(commands).not.toContain('migration.env');
    expect(commands).not.toContain('docker compose down');

    // A stray .env is loaded above the schema and a `$` in one of its values is
    // parsed as an expression; the deploy refuses to run with either present.
    expect(commands).toContain('the schema is the only source of production values');

    expect(job.steps.find((step) => step.name === 'Deploy downloaded release')?.if).toBe(
        "env.HAUS_RELEASE_MODE == 'deploy'"
    );
    expect(job.steps.find((step) => step.name === 'Verify installed release')?.if).toBeUndefined();
    // The deploy proves both the delivered environment and public artifact.
    expect(job.steps.at(-2)?.name).toBe('Verify the delivered environment');
    expect(job.steps.at(-2)?.run).toContain('verify-deployed-secrets.ts');
    expect(job.steps.at(-1)?.name).toBe('Prove public Server and hosted Haus App');
    expect(job.steps.at(-1)?.run).toContain('verify-hosted-haus.mjs');
    // No notification step: it read two repository secrets that never existed,
    // so it could only ever have been a silent no-op.
    expect(source).not.toContain('deploy-notify');
});

test('documents version publication as the only production promotion', () => {
    const releaseDocs = readFileSync(join(repoRoot, 'docs/operations/releases.md'), 'utf8');
    const deployDocs = readFileSync(
        join(repoRoot, 'docs/operations/haus-server-deploy.md'),
        'utf8'
    );

    expect(releaseDocs).toContain('A push to `main` without a release record does not deploy');
    expect(releaseDocs).toContain('one atomic production artifact with one Server SemVer');
    expect(releaseDocs).toContain('`activate` verifies and switches');
    expect(deployDocs).toContain('/Users/zknicker/srv/haus');
    expect(deployDocs).toContain('never run `git clean`');
    expect(deployDocs).toContain('public Cloudflare Access configuration');
    expect(deployDocs).not.toContain('/opt/haus-server');
});
