import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDevPorts } from './dev-ports.mjs';
import { DevStackController } from './dev-stack-controller.mjs';
import { DevStackScreen } from './dev-stack-screen.mjs';
import { HEROUI_PACKAGE_PATH, hasHeroUiArtifacts, heroUiPackageRoot } from './heroui-artifacts.mjs';

function main() {
    const mode = process.argv[2] ?? 'web';
    if (!['desktop', 'web'].includes(mode)) {
        console.error(`Unknown dev stack mode "${mode}". Use "web" or "desktop".`);
        process.exit(1);
    }
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    // Starting vite without these artifacts caches a broken @heroui-pro/react
    // resolution that survives a restart, so refuse the boot instead.
    if (!hasHeroUiArtifacts(heroUiPackageRoot(repositoryRoot))) {
        console.error(
            `${HEROUI_PACKAGE_PATH} is missing its downloaded artifacts. Run \`bun run setup:worktree\` before starting the dev stack.`
        );
        process.exit(1);
    }
    const ports = resolveDevPorts({ repositoryRoot });
    const controller = new DevStackController({
        mode,
        ports,
        repositoryRoot,
    });
    const screen = new DevStackScreen(controller);
    screen.start();

    const stop = (signal) => {
        void controller.stop(signal === 'SIGINT' ? 130 : 143, {
            force: true,
            signal,
        });
    };

    process.on('SIGINT', () => stop('SIGINT'));
    process.on('SIGTERM', () => stop('SIGTERM'));

    controller.on('exit', (code) => {
        screen.stop();
        process.exit(code);
    });

    void controller.start().catch((error) => {
        controller.addLog('haus', error instanceof Error ? error.message : String(error));
        void controller.stop(1);
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
