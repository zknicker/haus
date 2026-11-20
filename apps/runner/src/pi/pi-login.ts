import type { AuthEvent, AuthPrompt } from '@earendil-works/pi-ai';
import { chatgptProviderId, openFileCredentialStore, piLoginsDir } from './pi-credentials.ts';
import { createPiModels } from './pi-models.ts';

export async function loginChatgpt(input: { dataDir: string; write: (line: string) => void }) {
    const directory = piLoginsDir(input.dataDir);
    const models = createPiModels({
        apiKeys: { geminiApiKey: null, openrouterApiKey: null, xaiApiKey: null },
        credentials: openFileCredentialStore(directory),
    });
    await models.login(chatgptProviderId, 'oauth', {
        notify: (event) => input.write(describe(event)),
        prompt: answerHeadless,
    });
    input.write(`Signed in to ChatGPT. The sign-in is saved in ${directory}.`);
}

export function answerHeadless(prompt: AuthPrompt) {
    if (prompt.type === 'select' && prompt.options.some((option) => option.id === deviceCode)) {
        return Promise.resolve(deviceCode);
    }
    return Promise.reject(
        new Error(`haus-runner login has no terminal prompt to answer "${prompt.message}".`)
    );
}

function describe(event: AuthEvent) {
    switch (event.type) {
        case 'device_code':
            return `Open ${event.verificationUri} and enter the code ${event.userCode}.`;
        case 'auth_url':
            return `Open ${event.url}${event.instructions ? `. ${event.instructions}` : ''}`;
        case 'info':
        case 'progress':
            return event.message;
        default:
            return event satisfies never;
    }
}

const deviceCode = 'device_code';
