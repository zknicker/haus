# Haus visuals — components

Read [design-system.md](design-system.md) first; this module adds the non-chart
building blocks and the copy-ready fragments.

## The plate and the card

Almost everything here is a **plate**: `--surface-secondary`, `--radius`,
`--pad-md`, no border. Plates sit straight on the conversation, because the
conversation is the container. A plate on a plate goes `--surface-tertiary`,
and three levels of nesting is the ceiling.

The one exception is the **record card**: a bordered `--surface` box at
`--radius-card`, for a single bounded object the reply is about — a product, a
listing, an order, a contact. One card, with an edge, because the object has an
edge. A row of record cards is a table; send it to the reply.

## Tiles

- At most four tiles in a row, `grid-template-columns: repeat(auto-fit, minmax(160px, 1fr))`
  and `gap: var(--gap-sm)`. Columns take `minmax(0, 1fr)`: a bare `1fr` floors
  at the content width, so one long label blows the column instead of truncating.
- Label 12px `--muted-foreground`, value 24–36px weight 500 with `line-height`
  at least 1.08, delta chip underneath. Values are compact and rounded — whole
  dollars, `12.9K`, `$4.2M`, never cents.
- Tiles alone answer no trend question. Either put one chart under the row, or
  give each tile a sparkline.
- A delta chip's color is direction × whether up is good: revenue up is
  `--success-bg`, returns up is `--error-bg`. `--warning-bg` is for stale or
  missing states — not synced, no data — never for a drop. Every chip carries a
  label; color never carries meaning alone.

## Meters and progress

A meter is one number against a limit — spend against budget, units against a
target. Never a two-slice pie.

- Track and fill are the same hue: the track is a light step
  (`color-mix(in srgb, var(--chart-1) 14%, transparent)`), the fill is solid.
  A gray track under a blue fill reads as two unrelated things.
- The fill turns `--error` only when the value has actually breached the limit,
  and then the row carries a chip saying so. Status color is a verdict.
- State both numbers in text beside the meter. A bar with no numbers is decoration.

## Native controls

The frame already styles bare `input`, `select`, `textarea`, `button`,
`input[type=range]`, and `table`, and sets `accent-color`. Write the bare tag —
a hand-built control looks alien. An interactive visual:

- Sets `step` on every range and number input, so no drag can produce a number
  with fourteen decimals.
- Rounds every value it prints, including the ones it computes. Cents appear
  only where the unit is genuinely sub-dollar — a per-unit royalty, a list
  price. Totals and tile values stay whole.
- Shows invalid input as a 12–13px `var(--error)` message inline and does not
  advance. `--error-foreground` is the text color on the `--error-bg` tint, not
  on the page.
- Updates on `input`, never on a submit button, and never fetches anything.

## Fragments

### KPI row

Plates on the page, not cards on a card: no border, no `--radius-card`.

```html
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--gap-sm)">
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Revenue</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">$102.7K</div>
    <span style="display:inline-block;margin-top:var(--gap-xs);padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--success-bg);color:var(--success-foreground)">↑ 12.8%</span>
  </div>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Returns</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">184</div>
    <span style="display:inline-block;margin-top:var(--gap-xs);padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--error-bg);color:var(--error-foreground)">↑ 6.2%</span>
  </div>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Today</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">—</div>
    <span style="display:inline-block;margin-top:var(--gap-xs);padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--warning-bg);color:var(--warning-foreground)">Not synced yet</span>
  </div>
</div>
```

### Tile with sparkline

The same plate with the shape behind the number, for when the row has to answer
a trend question on its own. The sparkline is decoration for a screen reader —
the tile's words already carry the value.

```html
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:var(--gap-sm)">
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Revenue, 14 days</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">$12.4K</div>
    <svg width="100%" height="28" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true" style="margin-top:var(--gap-xs)">
      <polyline points="0,22 10,19 20,23 30,16 40,18 50,12 60,14 70,9 80,11 90,7 100,9 110,5 120,3" fill="none" stroke="var(--chart-1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>
  </div>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Units, 14 days</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">684</div>
    <svg width="100%" height="28" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true" style="margin-top:var(--gap-xs)">
      <polyline points="0,12 10,14 20,11 30,15 40,13 50,17 60,15 70,19 80,17 90,20 100,18 110,22 120,21" fill="none" stroke="var(--chart-5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>
  </div>
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:12px;color:var(--muted-foreground)">Returns, 14 days</div>
    <div style="margin-top:2px;font-size:26px;font-weight:500;line-height:1.15">61</div>
    <svg width="100%" height="28" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true" style="margin-top:var(--gap-xs)">
      <polyline points="0,18 10,17 20,19 30,16 40,18 50,15 60,17 70,14 80,16 90,13 100,15 110,12 120,14" fill="none" stroke="var(--chart-5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>
  </div>
</div>
```

### Comparison cards

```html
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--gap-sm)">
  <div style="background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
    <div style="font-size:15px;font-weight:500">Starter</div>
    <div style="margin-top:2px;color:var(--muted-foreground)">$0 · 1 seat · community support</div>
  </div>
  <div style="background:var(--surface-secondary);border:2px solid var(--accent);border-radius:var(--radius);padding:calc(var(--pad-md) - 2px)">
    <div style="display:flex;align-items:center;gap:var(--gap-xs)">
      <span style="font-size:15px;font-weight:500">Team</span>
      <span style="padding:1px 6px;border-radius:var(--radius);font-size:11px;background:var(--accent-bg);color:var(--accent-foreground)">Recommended</span>
    </div>
    <div style="margin-top:2px;color:var(--muted-foreground)">$24 · 5 seats · shared workspaces</div>
  </div>
</div>
```

### Record card

The one bordered card: a single bounded object. Border `--border`, fill
`--surface`, corner `--radius-card`. Mono for the id, hairline rows for the
fields, a status chip that carries a word.

```html
<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:var(--pad-lg)">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--gap-sm)">
    <div style="min-width:0">
      <div style="font-size:16px;font-weight:500">That's My Grandson Out There Baseball Grandma</div>
      <div style="margin-top:2px;font-size:12px;color:var(--muted-foreground);font-family:var(--font-mono)">B082Z184NZ · US</div>
    </div>
    <span style="flex:0 0 auto;padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--success-bg);color:var(--success-foreground)">Live</span>
  </div>
  <div style="margin-top:var(--pad-md);display:grid;gap:var(--gap-xs)">
    <div style="display:flex;justify-content:space-between;gap:var(--gap-sm);padding:6px 0;border-top:1px solid var(--border)">
      <span style="color:var(--muted-foreground)">List price</span>
      <span style="font-variant-numeric:tabular-nums">$21.99</span>
    </div>
    <div style="display:flex;justify-content:space-between;gap:var(--gap-sm);padding:6px 0;border-top:1px solid var(--border)">
      <span style="color:var(--muted-foreground)">Royalty per unit</span>
      <span style="font-variant-numeric:tabular-nums">$4.18</span>
    </div>
    <div style="display:flex;justify-content:space-between;gap:var(--gap-sm);padding:6px 0;border-top:1px solid var(--border)">
      <span style="color:var(--muted-foreground)">Units, last 7 days</span>
      <span style="font-variant-numeric:tabular-nums">11</span>
    </div>
    <div style="display:flex;justify-content:space-between;gap:var(--gap-sm);padding:6px 0;border-top:1px solid var(--border)">
      <span style="color:var(--muted-foreground)">Revenue, last 7 days</span>
      <span style="font-variant-numeric:tabular-nums">$234</span>
    </div>
  </div>
</div>
```

### Status list

One row per job: a dot, a label, what happened, when. The dot is never the only
signal — the words say the same thing.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Three of four syncs are current; the metadata pass has not run since 10:06pm last night.</h2>
<div style="display:grid;gap:var(--gap-xs)">
  <div style="display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:var(--gap-sm);background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-sm) var(--pad-md)">
    <span style="width:8px;height:8px;border-radius:50%;background:var(--success)"></span>
    <span>Sales feed · up to date</span>
    <span style="font-size:12px;color:var(--muted-foreground);white-space:nowrap">6 min ago</span>
  </div>
  <div style="display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:var(--gap-sm);background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-sm) var(--pad-md)">
    <span style="width:8px;height:8px;border-radius:50%;background:var(--success)"></span>
    <span>Royalty report · 30 days imported</span>
    <span style="font-size:12px;color:var(--muted-foreground);white-space:nowrap">2 hours ago</span>
  </div>
  <div style="display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:var(--gap-sm);background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-sm) var(--pad-md)">
    <span style="width:8px;height:8px;border-radius:50%;background:var(--warning)"></span>
    <span>Listing metadata · stalled, last pass 10:06pm</span>
    <span style="font-size:12px;color:var(--muted-foreground);white-space:nowrap">10 hours ago</span>
  </div>
  <div style="display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:var(--gap-sm);background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-sm) var(--pad-md)">
    <span style="width:8px;height:8px;border-radius:50%;background:var(--success)"></span>
    <span>Ads report · synced</span>
    <span style="font-size:12px;color:var(--muted-foreground);white-space:nowrap">41 min ago</span>
  </div>
</div>
```

### Meter

Spend against budget. Track and fill share a hue; the breached row turns
`--error` and says so in words.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Holiday push is $80 over its September budget; the other three campaigns are inside theirs.</h2>
<div style="display:grid;gap:var(--gap-md)" id="meters"></div>
<script>
const campaigns = [
  { budget: 700, name: 'Holiday push', spend: 780 },
  { budget: 600, name: 'Bee family', spend: 530 },
  { budget: 600, name: 'Harvest tees', spend: 410 },
  { budget: 400, name: 'Dog lovers', spend: 290 }
];
const money = (value) => '$' + Math.round(value).toLocaleString();
const host = document.getElementById('meters');
for (const campaign of campaigns) {
  const over = campaign.spend > campaign.budget;
  const fill = Math.min(100, Math.round((campaign.spend / campaign.budget) * 100));
  const row = document.createElement('div');
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:var(--gap-sm);margin-bottom:6px';
  const name = document.createElement('span');
  name.textContent = campaign.name;
  const figures = document.createElement('span');
  figures.style.cssText = 'margin-left:auto;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums';
  figures.textContent = money(campaign.spend) + ' of ' + money(campaign.budget);
  head.append(name, figures);
  if (over) {
    const chip = document.createElement('span');
    chip.style.cssText = 'padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--error-bg);color:var(--error-foreground)';
    chip.textContent = money(campaign.spend - campaign.budget) + ' over';
    head.append(chip);
  }
  const track = document.createElement('div');
  track.style.cssText = 'height:8px;border-radius:var(--radius);background:color-mix(in srgb, var(--chart-1) 14%, transparent);overflow:hidden';
  const bar = document.createElement('div');
  bar.style.cssText = 'height:100%;border-radius:var(--radius);width:' + fill + '%';
  bar.style.background = over ? 'var(--error)' : 'var(--chart-1)';
  track.append(bar);
  row.append(head, track);
  host.append(row);
}
</script>
```

### Calculator

Native controls, `step` set on the range, every printed number rounded, and a
readout that updates on `input`. No submit, no fetch.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">At $21.99 a standard tee returns about $2.59 a unit, or $1,038 a month at 400 units.</h2>
<div style="display:grid;gap:var(--gap-md);background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
  <label style="display:grid;gap:var(--gap-xs)">
    <span style="display:flex;justify-content:space-between;gap:var(--gap-sm)"><span>List price</span><span id="priceOut" style="font-variant-numeric:tabular-nums">$21.99</span></span>
    <input id="price" type="range" min="14.99" max="39.99" step="1" value="21.99">
  </label>
  <label style="display:grid;gap:var(--gap-xs)">
    <span style="display:flex;justify-content:space-between;gap:var(--gap-sm)"><span>Units a month</span><span id="unitsOut" style="font-variant-numeric:tabular-nums">400</span></span>
    <input id="units" type="range" min="50" max="1500" step="50" value="400">
  </label>
  <label style="display:grid;gap:var(--gap-xs)">
    <span>Product</span>
    <select id="product">
      <option value="10.6">Standard tee</option>
      <option value="16.4">Premium tee</option>
      <option value="21.9">Pullover hoodie</option>
    </select>
  </label>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--gap-sm)">
    <div style="background:var(--surface-tertiary);border-radius:var(--radius);padding:var(--pad-sm) var(--pad-md)">
      <div style="font-size:12px;color:var(--muted-foreground)">Royalty per unit</div>
      <div id="unit" style="font-size:24px;font-weight:500;line-height:1.15">$2.59</div>
    </div>
    <div style="background:var(--surface-tertiary);border-radius:var(--radius);padding:var(--pad-sm) var(--pad-md)">
      <div style="font-size:12px;color:var(--muted-foreground)">Royalty a month</div>
      <div id="month" style="font-size:24px;font-weight:500;line-height:1.15">$1,038</div>
    </div>
  </div>
  <div id="warn" style="font-size:12px;color:var(--error)"></div>
</div>
<script>
const price = document.getElementById('price');
const units = document.getElementById('units');
const product = document.getElementById('product');
const recalc = () => {
  const list = Number(price.value);
  const count = Number(units.value);
  const cost = Number(product.value);
  const perUnit = list * 0.6 - cost;
  document.getElementById('priceOut').textContent = '$' + list.toFixed(2);
  document.getElementById('unitsOut').textContent = count.toLocaleString();
  document.getElementById('unit').textContent = (perUnit < 0 ? '-$' : '$') + Math.abs(perUnit).toFixed(2);
  document.getElementById('month').textContent = (perUnit < 0 ? '-$' : '$') + Math.abs(Math.round(perUnit * count)).toLocaleString();
  document.getElementById('warn').textContent = perUnit < 0 ? 'Below the print cost — this price loses money on every unit.' : '';
};
for (const control of [price, units, product]) {
  control.addEventListener('input', recalc);
}
recalc();
</script>
```

### Table

Tables live in the reply as Markdown; right-align numeric columns with `---:`.
The `<table>` fragment is for the interactive or bounded-record case only — the
frame already styles bare `<table>` markup and scrolls a wide one.

```html
<table>
  <caption>Spend by channel, June 2026</caption>
  <thead><tr><th>Channel</th><th style="text-align:right">Spend</th><th style="text-align:right">ROAS</th></tr></thead>
  <tbody>
    <tr><td>Search</td><td style="text-align:right">$42,300</td><td style="text-align:right">3.1×</td></tr>
    <tr><td>Social</td><td style="text-align:right">$18,900</td><td style="text-align:right">2.4×</td></tr>
  </tbody>
</table>
```
