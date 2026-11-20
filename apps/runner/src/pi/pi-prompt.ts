import { section } from '@earendil-works/pi-durable';

export const hausSectionKey = 'haus';

export function hausSection(instructions: () => string) {
    return section(hausSectionKey, () => instructions(), { tag: false });
}
