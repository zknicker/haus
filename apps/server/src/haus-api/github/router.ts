import { createRouter } from '../trpc.ts';
import { bindInstallation } from './bind-installation.ts';
import { installCandidates } from './install-candidates.ts';
import { installations } from './installations.ts';
import { repositories } from './repositories.ts';
import { startInstall } from './start-install.ts';
import { unbindInstallation } from './unbind-installation.ts';

/**
 * The GitHub connection's installation procedures
 * (specs/github-app-connection.md#installations). Input and result schemas
 * are in `@haus/api` `github.ts`; `installationId` is the Haus row id.
 */
export const githubRouter = createRouter({
    bindInstallation,
    installCandidates,
    installations,
    repositories,
    startInstall,
    unbindInstallation,
});
