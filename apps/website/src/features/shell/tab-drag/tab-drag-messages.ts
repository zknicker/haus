import { parseTabBundle } from '../../../hooks/desktop-tabs/desktop-tabs-storage.ts';
import type { TabDragMessage } from '../../../lib/desktop-tab-drag.ts';
import { measureBand, typicalTabWidth } from './tab-band-dom.ts';
import type { TabDragDeps, TabDragEngine } from './tab-drag-engine.ts';
import { resolveSlot, type Slot } from './tab-drag-geometry.ts';
import { slotTarget } from './tab-drag-projection.ts';

/**
 * Electron's half of a cross-window drag, as this window sees it: dragged
 * tabs entering its band (adopted at the cursor, then riding it), the relayed
 * cursor, the drop, and Escape taking them back (`withdraw` here, `restore`
 * in the pressing window).
 */
export function handleTabDragMessage(
    engine: TabDragEngine,
    deps: Pick<TabDragDeps, 'band' | 'tabs'>,
    message: TabDragMessage,
    report: () => void
) {
    const state = engine.state();
    const relayed = state.phase === 'attached' && state.owner === 'relay';
    switch (message.kind) {
        case 'attach': {
            const bundle = parseTabBundle(message.bundle);
            const band = deps.band();
            if (!(bundle && band)) {
                return;
            }
            const tabIds = bundle.tabs.map((tab) => tab.id);
            const layout = measureBand(band);
            const slot: Slot = resolveSlot(layout, {
                draggedIds: tabIds,
                draggedWidth: typicalTabWidth(layout) * tabIds.length,
                grabX: message.grab.x,
                pointer: message.point,
            }) ?? { index: 0, row: layout.rows[0]?.row ?? 'primary' };
            const tabs = deps.tabs();
            const target = slotTarget(tabs.state, tabIds, slot);
            if (target && !tabIds.some((id) => tabs.state.tabs[id])) {
                tabs.adopt(bundle, target);
            }
            engine.dispatch({
                grab: message.grab,
                kind: 'attach',
                point: message.point,
                slot,
                tabIds,
            });
            return;
        }
        case 'move':
            if (relayed) {
                engine.move(message.point);
            }
            return;
        case 'release':
            if (relayed) {
                engine.dispatch({ kind: 'release' });
            }
            return;
        case 'restore':
            engine.restore(parseTabBundle(message.bundle));
            return;
        case 'withdraw':
            if (relayed && message.tabIds.every((id) => state.tabIds.includes(id))) {
                deps.tabs().release(message.tabIds);
                engine.dispatch({ kind: 'withdrawn' });
            }
            return;
        case 'end':
            // Relayed tabs stay where they rode; the pressing window just tears down.
            engine.dispatch(relayed ? { kind: 'release' } : { kind: 'withdrawn' });
            return;
        case 'measure':
            report();
            return;
    }
}
