import { createRouter } from '../trpc.ts';

/**
 * The GitHub connection's installation procedures (`startInstall`,
 * `installCandidates`, `bindInstallation`, `unbindInstallation`,
 * `installations`, `repositories`). Empty until Slice B; their input and
 * result schemas are in `@haus/api` `github.ts`.
 */
export const githubRouter = createRouter({});
