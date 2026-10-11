import {
    createGithubAppJwtSigner,
    type GithubAppConfig,
    type GithubAppEnvironment,
    type GithubAppJwtSigner,
    readGithubAppConfig,
} from './app-auth.ts';
import type { GithubApiTransport } from './github-api.ts';

/**
 * The configured Haus GitHub App as the running Server holds it: its
 * credentials, one JWT signer, and the REST transport (tests point it at a
 * fake). Null wherever the App is unconfigured.
 */
export interface GithubApp {
    config: GithubAppConfig;
    signer: GithubAppJwtSigner;
    transport: GithubApiTransport;
}

export async function createGithubApp(
    config: GithubAppConfig,
    transport: GithubApiTransport = {}
): Promise<GithubApp> {
    return { config, signer: await createGithubAppJwtSigner(config), transport };
}

/** The App from the Server environment, or null when any credential is missing. */
export async function githubAppFromEnvironment(
    environment: GithubAppEnvironment
): Promise<GithubApp | null> {
    const config = readGithubAppConfig(environment);
    return config ? await createGithubApp(config) : null;
}
