import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    deliverableNames,
    deliveredEnvironmentNames,
    readSchemaItems,
    varlockBuiltins,
} from './lib/env-schema.ts';

/**
 * Name-only contract check across the places a Haus environment value
 * appears: `.env.schema` (the contract), the Server's typed zod env module,
 * the bare `process.env.X` reads in the shipped Server and the release
 * scripts, the committed launchd delivery surface, and the deploy workflow.
 *
 * Nothing here resolves a value or contacts 1Password. `varlock audit` cannot
 * do this job — it sees neither the launchd surface nor the workflow.
 */
const repositoryRoot = process.cwd();
const schemaPath = join(repositoryRoot, '.env.schema');
const runServerPath = join(repositoryRoot, 'apps/server/operations/run-server');
const deployWorkflowPath = join(repositoryRoot, '.github/workflows/deploy-haus-server.yml');
const releaseHostWorkflowPath = join(repositoryRoot, '.github/workflows/deploy-release-host.yml');
const qualityWorkflowPath = join(repositoryRoot, '.github/workflows/quality.yml');
const releaseWorkflowPath = join(repositoryRoot, '.github/workflows/release.yml');
const releaseSetupActionPath = join(
    repositoryRoot,
    '.github/actions/setup-release-dependencies/action.yml'
);

// Supplied by the operating system, the toolchain, or GitHub Actions itself.
// Out of the environment contract by design.
const platformNames = new Set([
    'CI',
    'FORCE_COLOR',
    'GITHUB_ENV',
    'GITHUB_REF',
    'GITHUB_REPOSITORY',
    'GITHUB_SHA',
    'GITHUB_STEP_SUMMARY',
    'HOME',
    'INIT_CWD',
    'NO_COLOR',
    'NODE_ENV',
    'PATH',
    'RUNNER_TEMP',
    'SHELL',
    'TMPDIR',
    'USER',
    'XDG_CONFIG_HOME',
]);

// Values this repository's own processes compute and hand to their children:
// per-worktree dev-stack ports and state roots, release-run switches, and the
// literal names third-party build tools insist on. They arrive from a sibling
// process, never from a secret store, so the schema does not own them.
const processContractNames = new Set([
    'CSC_IDENTITY_AUTO_DISCOVERY',
    'CSC_NAME',
    'HAUS_COMPUTER_DATA_ROOT',
    'HAUS_DEV_STACK',
    'HAUS_ELECTRON_NOTARIZE',
    'HAUS_MIGRATIONS_FOLDER',
    'HAUS_PRECOMPILED_IOS_ICON_DIR',
    'HAUS_RELEASE_INCLUDE_DESKTOP',
    'HAUS_SERVER_ORIGIN',
    'HAUS_STARTUP_UI',
    'HAUS_WEBSITE_PORT',
    'IOS_DEVELOPMENT_TEAM',
]);

// Declared in the schema but read by an external tool rather than by our
// source, so the "something reads this" scan cannot see the consumer.
const externallyConsumedNames = new Map([
    ['AWS_ACCESS_KEY_ID', 'the aws CLI in scripts/release/publish-desktop.mjs'],
    ['AWS_SECRET_ACCESS_KEY', 'the aws CLI in scripts/release/publish-desktop.mjs'],
    ['CLOUDFLARE_API_TOKEN', 'Wrangler in scripts/deploy-release-host.mjs'],
    ['CI_OP_TOKEN', 'varlock @initOp(id=development)'],
    ['CURSOR_CLOUD_AGENTS_DEVELOPMENT_OP_TOKEN', 'varlock @initOp(id=development)'],
    ['DEPLOY_AGENT_PRODUCTION_OP_TOKEN', 'varlock @initOp(id=production)'],
    ['RELEASE_AGENT_TOOLING_OP_TOKEN', 'varlock @initOp(id=tooling)'],
]);

// Names run-server may set for itself. Everything else the Server receives
// comes from the rendered config/server.env, which the schema owns.
const runServerOwnedNames = new Set(['NODE_ENV']);

const issues: string[] = [];
const sorted = (names: Iterable<string>) => [...names].sort();

const grep = (args: string[], paths: string[]): string => {
    try {
        return execFileSync('grep', [...args, ...paths], {
            cwd: repositoryRoot,
            encoding: 'utf8',
        });
    } catch {
        // grep exits 1 when nothing matches.
        return '';
    }
};

// Tracked files only. A filesystem walk would also read build output, local
// caches, and downloaded artifacts — slow, and it would let a stale `dist/`
// stand in for a real consumer.
const trackedFilesContaining = (needle: string): string[] => {
    try {
        return execFileSync(
            'git',
            ['grep', '--name-only', '--untracked', '--fixed-strings', needle, '--', '.'],
            {
                cwd: repositoryRoot,
                encoding: 'utf8',
            }
        )
            .split('\n')
            .filter(Boolean);
    } catch {
        // git grep exits 1 when nothing matches.
        return [];
    }
};

const readEnvNames = (paths: string[], includes: string[]): Set<string> => {
    const output = grep(
        ['-rhoE', '(process|import\\.meta)\\.env\\.[A-Z][A-Z0-9_]*', ...includes],
        paths
    );
    const names = new Set<string>();
    for (const match of output.split('\n')) {
        const name = match.replace(/^.*\.env\./u, '').trim();
        if (name) {
            names.add(name);
        }
    }
    return names;
};

const schemaItems = readSchemaItems(schemaPath);
const deliverable = deliverableNames(schemaItems);
const schemaNames = new Set(schemaItems.map((item) => item.name));

// 1. Sensitivity is stated, never inherited. The schema defaults to sensitive,
//    so an unmarked item is safe but ambiguous to every later reader.
for (const item of schemaItems) {
    if (!item.hasExplicitSensitivity) {
        issues.push(`${item.name} does not declare @sensitive or @public in .env.schema.`);
    }
}

// 2. A VITE_ value is inlined into the public Haus App bundle at build time.
//    Marking one sensitive means a secret is about to ship to every visitor.
for (const item of schemaItems) {
    if (item.name.startsWith('VITE_') && item.isSensitive) {
        issues.push(
            `${item.name} is @sensitive but VITE_ values are inlined into the public Haus App bundle.`
        );
    }
}

// 3. The Server's typed env module is its consumer-side contract. Every key it
//    validates must be a deliverable schema item, or the Server is validating
//    something nothing delivers.
const typedEnvNames = deliveredEnvironmentNames(repositoryRoot);
if (typedEnvNames.size === 0) {
    issues.push('the Server typed env module exposed no keys; the contract check cannot see it.');
}
for (const name of sorted(typedEnvNames)) {
    if (!deliverable.has(name)) {
        issues.push(
            `${name} is validated by the Server typed env module but is not a deliverable .env.schema item.`
        );
    }
}

// 4. Everything the shipped Server and the release scripts read directly must
//    be a declared schema item, a platform value, or a declared process
//    contract. These are the two places values enter from outside. The Server
//    is held to the stricter bar: what it reads must also be deliverable,
//    because `varlock run` never exports an @internal item to it.
const scanIncludes = [
    '--include=*.ts',
    '--include=*.mjs',
    '--exclude=*.test.ts',
    '--exclude=*.test.mjs',
];
const serverConsumerNames = readEnvNames(['apps/server/src'], scanIncludes);
const releaseConsumerNames = readEnvNames(['scripts/release'], scanIncludes);
const consumerNames = new Set([...serverConsumerNames, ...releaseConsumerNames]);
for (const name of sorted(consumerNames)) {
    if (platformNames.has(name) || processContractNames.has(name)) {
        continue;
    }
    if (serverConsumerNames.has(name) && !deliverable.has(name)) {
        issues.push(
            `${name} is read by the shipped Server but is not a deliverable .env.schema item.`
        );
        continue;
    }
    if (!schemaNames.has(name)) {
        issues.push(
            `${name} is read by the Server or a release script but is not declared in .env.schema.`
        );
    }
}

// 5. Every schema item has a consumer. The schema only ever receives variables
//    something actually reads.
for (const item of schemaItems) {
    if (varlockBuiltins.has(item.name) || externallyConsumedNames.has(item.name)) {
        continue;
    }
    const mentioned = trackedFilesContaining(item.name).filter((path) => path !== '.env.schema');
    if (mentioned.length === 0) {
        issues.push(`${item.name} is declared in .env.schema but nothing reads it.`);
    }
}

// 6. The launchd job's start script must not own values of its own, and must
//    never re-enter varlock: launchd stores a command line, and the package
//    scripts wrap themselves in `varlock run`. A production service that
//    re-resolved the schema at boot would do so under the development
//    lifecycle.
const runServer = readFileSync(runServerPath, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
if (runServer.includes('varlock')) {
    issues.push(
        'apps/server/operations/run-server invokes varlock; the service must receive its already-resolved environment instead.'
    );
}
for (const match of runServer.matchAll(/^export ([A-Z][A-Z0-9_]*)=/gmu)) {
    if (!runServerOwnedNames.has(match[1])) {
        issues.push(
            `${match[1]} is exported by apps/server/operations/run-server; the schema is the only owner of delivered values.`
        );
    }
}

// 7. Workflows may hold only the deploy/CI bootstrap and the dedicated release
//    Tooling bootstrap. Each maps to its named consumer role; Cursor's
//    account-level token never appears in GitHub Actions.
const allowedWorkflowSecrets = new Map([
    [deployWorkflowPath, new Set(['GH_DEPLOY_AGENT_PRODUCTION_OP_TOKEN'])],
    [releaseHostWorkflowPath, new Set(['GH_DEPLOY_AGENT_PRODUCTION_OP_TOKEN'])],
    [qualityWorkflowPath, new Set(['GH_DEPLOY_AGENT_PRODUCTION_OP_TOKEN'])],
    [
        releaseWorkflowPath,
        new Set(['GH_DEPLOY_AGENT_PRODUCTION_OP_TOKEN', 'GH_RELEASE_AGENT_TOOLING_OP_TOKEN']),
    ],
]);
const workflowContents = new Map<string, string>();
for (const workflowPath of [
    deployWorkflowPath,
    releaseHostWorkflowPath,
    qualityWorkflowPath,
    releaseWorkflowPath,
]) {
    const workflow = readFileSync(workflowPath, 'utf8');
    workflowContents.set(workflowPath, workflow);
    for (const match of workflow.matchAll(/secrets\.([A-Z][A-Z0-9_]*)/gu)) {
        if (!allowedWorkflowSecrets.get(workflowPath)?.has(match[1])) {
            issues.push(
                `${workflowPath.replace(`${repositoryRoot}/`, '')} reads undeclared workflow secret secrets.${match[1]}.`
            );
        }
    }
}

const githubDeploySecret = ['$', '{{ secrets.GH_DEPLOY_AGENT_PRODUCTION_OP_TOKEN }}'].join('');
const githubReleaseSecret = ['$', '{{ secrets.GH_RELEASE_AGENT_TOOLING_OP_TOKEN }}'].join('');
const requiredWorkflowMappings: [string, string, string][] = [
    [
        deployWorkflowPath,
        `DEPLOY_AGENT_PRODUCTION_OP_TOKEN: ${githubDeploySecret}`,
        'deploy bootstrap',
    ],
    [
        releaseHostWorkflowPath,
        `DEPLOY_AGENT_PRODUCTION_OP_TOKEN: ${githubDeploySecret}`,
        'release-host deploy bootstrap',
    ],
    [qualityWorkflowPath, `CI_OP_TOKEN: ${githubDeploySecret}`, 'CI bootstrap'],
    [releaseWorkflowPath, `ci-op-token: ${githubDeploySecret}`, 'release dependency bootstrap'],
    [
        releaseWorkflowPath,
        `RELEASE_AGENT_TOOLING_OP_TOKEN: ${githubReleaseSecret}`,
        'release Tooling bootstrap',
    ],
];
for (const [workflowPath, requiredMapping, role] of requiredWorkflowMappings) {
    if (!workflowContents.get(workflowPath)?.includes(requiredMapping)) {
        issues.push(
            `${workflowPath.replace(`${repositoryRoot}/`, '')} must map its ${role} to the role-specific slot.`
        );
    }
}

const releaseSetupAction = readFileSync(releaseSetupActionPath, 'utf8');
const compositeBootstrapMapping = ['CI_OP_TOKEN: $', '{{ inputs.ci-op-token }}'].join('');
if (!releaseSetupAction.includes(compositeBootstrapMapping)) {
    issues.push(
        '.github/actions/setup-release-dependencies/action.yml must scope the release dependency bootstrap to CI_OP_TOKEN.'
    );
}

for (const [workflowPath, workflow] of workflowContents) {
    if (workflow.includes('CURSOR_CLOUD_AGENTS_DEVELOPMENT_OP_TOKEN')) {
        issues.push(
            `${workflowPath.replace(`${repositoryRoot}/`, '')} uses the Cursor bootstrap slot; that name belongs only to Cursor Runtime Secrets.`
        );
    }
}

if (issues.length > 0) {
    console.error('Environment contract is out of sync:');
    for (const issue of issues) {
        console.error(`- ${issue}`);
    }
    process.exit(1);
}

console.log(
    `Environment contract is in sync (${schemaNames.size} schema items, ${deliverable.size} deliverable, ${typedEnvNames.size} validated by the Server, ${consumerNames.size} read directly by the Server or a release script).`
);
