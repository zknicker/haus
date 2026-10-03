import { runSignedUpdate } from './update.ts';

export async function runAttachmentUpdate(
    input: Parameters<typeof runSignedUpdate>[0]
): ReturnType<typeof runSignedUpdate> {
    let restarting = false;
    try {
        return await runSignedUpdate({
            ...input,
            restart: async () => {
                restarting = true;
                await input.restart();
            },
        });
    } catch (error) {
        if (restarting) {
            // The drain may have disposed our runtime. Let the resident replace this daemon.
            console.error(error);
            process.exit(1);
        }
        throw error;
    }
}
