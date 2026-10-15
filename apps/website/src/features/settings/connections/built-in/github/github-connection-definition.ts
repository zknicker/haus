import type { BuiltInConnectionDefinition } from '../built-in-connection-definition.ts';
import { GithubInstallationsSection } from './github-installations-section.tsx';

/** GitHub adds its Haus App installations under the signed-in account. */
export const githubConnectionDefinition: BuiltInConnectionDefinition = {
    preset: 'github',
    sections: [
        { id: 'installations', placement: 'after-account', Section: GithubInstallationsSection },
    ],
};
