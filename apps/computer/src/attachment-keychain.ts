import { computerStandalone } from './build-identity.ts';

export const attachmentKeychainService = 'haus.computer.attachment';

const readTimeoutMs = 10_000;

export type AttachmentCredentialProblem = 'locked' | 'missing';

export class AttachmentCredentialUnavailableError extends Error {
    constructor(
        readonly problem: AttachmentCredentialProblem,
        slug: string
    ) {
        super(
            problem === 'locked'
                ? `/${slug} is waiting for this Mac's login Keychain. Log in on the Mac, or run security unlock-keychain over SSH.`
                : `/${slug} has no Haus credential in this Mac's Keychain. Run haus-computer setup /${slug}.`
        );
        this.name = 'AttachmentCredentialUnavailableError';
    }
}

export type AttachmentKeychain = ReturnType<typeof attachmentKeychain>;

export const buildAttachmentKeychain =
    computerStandalone && process.platform === 'darwin' ? attachmentKeychain() : null;

export function attachmentKeychain(service = attachmentKeychainService) {
    const reads = new Map<string, Promise<string | null>>();

    function sharedRead(account: string) {
        const held = reads.get(account);
        if (held) {
            return held;
        }
        const pending = Bun.secrets.get({ name: account, service }).finally(() => {
            reads.delete(account);
        });
        reads.set(account, pending);
        return pending;
    }

    return {
        async read(account: string, slug: string) {
            const timeout = Promise.withResolvers<never>();
            const timer = setTimeout(
                () => timeout.reject(new AttachmentCredentialUnavailableError('locked', slug)),
                readTimeoutMs
            );
            try {
                return await Promise.race([sharedRead(account), timeout.promise]);
            } catch (cause) {
                if (cause instanceof AttachmentCredentialUnavailableError) {
                    throw cause;
                }
                throw new AttachmentCredentialUnavailableError('locked', slug);
            } finally {
                clearTimeout(timer);
            }
        },
        async write(account: string, credential: string) {
            await Bun.secrets.set({ name: account, service, value: credential });
            if ((await Bun.secrets.get({ name: account, service })) !== credential) {
                throw new Error('The macOS Keychain did not keep the Haus Computer credential.');
            }
        },
        async delete(account: string) {
            await Bun.secrets.delete({ name: account, service });
        },
    };
}
