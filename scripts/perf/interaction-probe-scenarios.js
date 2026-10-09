// Init script (runs before interaction-probe.js). Defines window.__perfScenarios:
// per-scenario region probes. Each probe returns a signature string when its
// region is displayed, or null. interaction-probe.js records when each
// signature first appears and every later change (pop-in order).
//
// Selectors come from the real DOM:
//   sidebar rows  [data-slot=sidebar-menu-item][aria-label=<name>] (data-href = route)
//   chat surface  [data-slot=chat-surface], composer labelled "Message <chat>"
//   message rows  [data-slot=message-scroller-item]
//   profile       h1, [data-slot=item-card-title|item-card-description],
//                 item-card-group-title, [data-slot=kpi-value], [data-slot=area-chart]
(() => {
    const MAIN = '[data-slot="app-layout-main"]';
    const main = () => document.querySelector(MAIN);
    const q = (sel, root = main()) => (root ? Array.from(root.querySelectorAll(sel)) : []);
    const text = (el) => (el?.textContent || '').trim().replace(/\s+/g, ' ');
    const visible = (el) => {
        if (!el) {
            return false;
        }
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.width > 0 && r.bottom > 0 && r.top < innerHeight;
    };
    const shown = (el) => !!el && (el.checkVisibility ? el.checkVisibility() : true) && visible(el);
    const sameChat = (a, b) =>
        a.replace(/^#/, '').trim().toLowerCase() === b.replace(/^#/, '').trim().toLowerCase();
    const groupByTitle = (title) =>
        q('[data-slot="item-card-group-title"]')
            .find((h) => text(h).startsWith(title))
            ?.closest('[data-slot="item-card-group"]');

    // Kept-alive chat views (<Activity mode="hidden">) keep their header and rows in
    // the DOM while hidden, so "fresh node" detection misses warm switches. Instead:
    // the TARGET chat's surface is the only displayed one (checkVisibility) and has
    // on-screen rows, and exactly one displayed header h1 exists and names the target.
    const targetSurface = (name) => {
        const surfaces = q('[data-slot="chat-surface"]').filter(shown);
        if (surfaces.length !== 1) {
            return null;
        }
        const label =
            surfaces[0].querySelector('[aria-label^="Message "]')?.getAttribute('aria-label') ?? '';
        return sameChat(label.slice('Message '.length), name) ? surfaces[0] : null;
    };
    // Rows outside the transcript's render window are empty placeholders; only
    // rendered rows count as painted.
    const targetRows = (name) => {
        const s = targetSurface(name);
        return s
            ? Array.from(
                  s.querySelectorAll(
                      '[data-slot="message-scroller-item"]:not([data-transcript-placeholder])'
                  )
              ).filter(visible)
            : [];
    };
    const countOrNull = (n) => (n ? String(n) : null);

    const channel = ({ name }) => ({
        header: () => {
            const headers = q('header h1').filter(shown);
            return headers.length === 1 && sameChat(text(headers[0]), name) ? name : null;
        },
        surface: () => (targetSurface(name) ? 'shown' : null),
        firstRow: () => (targetRows(name).length ? 'rows' : null),
        rowCount: () => countOrNull(targetRows(name).length),
        rowsInDom: () =>
            countOrNull(
                targetSurface(name)?.querySelectorAll('[data-slot="message-scroller-item"]')
                    .length ?? 0
            ),
        // Syntax highlighting lands after first paint; signature = highlighted token spans.
        codeHighlight: () => {
            const blocks = q('[data-slot="code-block-code"]').filter(visible);
            const spans = blocks.reduce(
                (n, b) => n + b.querySelectorAll('span[style], span[class]').length,
                0
            );
            return blocks.length ? String(spans) : null;
        },
        busy: () => (q('[aria-busy="true"]').some((el) => el.offsetParent) ? 'busy' : null),
    });

    const identityHeading = (name) =>
        q('h1').find((el) => !el.closest('.app-shell-band') && text(el) === name);
    const hubCard = (title) => () => {
        const t = q('[data-slot="item-card-title"]').find((el) => text(el) === title);
        const card = t?.closest('[data-slot="item-card"]');
        const d = card?.querySelector('[data-slot="item-card-description"]');
        const chip = card?.querySelector('[data-slot="chip"]');
        return d && text(d) ? text(d) + (chip ? ` [${text(chip)}]` : '') : null;
    };
    const hubCardTitles = [
        'Runs on',
        'Profile',
        'Automations',
        'Skills',
        'Connections',
        'Workspace',
    ];

    const profile = ({ name }) => ({
        breadcrumb: () => {
            const b = q('header [data-slot="breadcrumbs"]')[0];
            return b && text(b).includes(name) ? text(b) : null;
        },
        busy: () => {
            const b = q('[aria-busy="true"]').filter((el) => el.offsetParent);
            return b.length ? b.map(text).join('|') : null;
        },
        identity: () => (visible(identityHeading(name)) ? name : null),
        presence: () => {
            const chip = identityHeading(name)?.parentElement?.querySelector('[data-slot="chip"]');
            return chip ? text(chip) : null;
        },
        hubCards: () => {
            const titles = q('[data-slot="item-card-title"]').map(text);
            return titles.includes('Runs on') ? String(titles.length) : null;
        },
        ...Object.fromEntries(hubCardTitles.map((title) => [`card:${title}`, hubCard(title)])),
        chatRows: () =>
            countOrNull(groupByTitle('Chats')?.querySelectorAll('[data-slot="item-card"]').length),
        activityRows: () => {
            const g = groupByTitle('Recent activity');
            const cards = g ? Array.from(g.querySelectorAll('[data-slot="item-card"]')) : [];
            return countOrNull(cards.filter((c) => text(c)).length);
        },
        usageValue: () => {
            const v = q('[data-slot="kpi-value"]')[0];
            return v && text(v) ? text(v) : null;
        },
        usageChart: () => (q('[data-slot="area-chart"] svg path').length ? 'chart' : null),
    });

    window.__perfScenarios = { channel, profile };
})();
