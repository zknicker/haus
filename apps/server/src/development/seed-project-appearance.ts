import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema/chats.ts';

export async function seedDevelopmentProjectAppearance(
    db: HausDatabase,
    input: { serverId: string }
) {
    for (const [name, appearance] of Object.entries(projectAppearance)) {
        await db
            .update(chatsTable)
            .set(appearance)
            .where(
                and(
                    eq(chatsTable.serverId, input.serverId),
                    eq(chatsTable.kind, 'channel'),
                    eq(chatsTable.isAll, false),
                    eq(chatsTable.name, name),
                    isNull(chatsTable.icon),
                    isNull(chatsTable.color)
                )
            );
    }
}

const projectAppearance: Record<string, { color: string; icon: string }> = {
    automations: { color: 'violet', icon: 'WorkflowIcon' },
    general: { color: 'slate', icon: 'Megaphone01Icon' },
    'onboarding-owner': { color: 'amber', icon: 'Key01Icon' },
    product: { color: 'sky', icon: 'Telescope01Icon' },
    'repo-health': { color: 'emerald', icon: 'CommandLineIcon' },
    shop: { color: 'orange', icon: 'ShoppingBag01Icon' },
    'ui-gallery': { color: 'cyan', icon: 'PaintBoardIcon' },
};
