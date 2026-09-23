# Donut

Part-to-whole at a glance, never for comparing close values — two slices within
a few percent of each other are a ranked bar. Five slices is the ceiling: fold
the tail into an "Other" slice in `--chart-5` rather than seat a sixth. A donut
is one measure cut up, so it takes one hue in sequential steps and the total
sits in the hole, where a pie wastes its middle. Five slices means five steps
— 100 / 82 / 64 / 48 / 34% — and the floor stays near the house's 35% so the
last slice still reads against a dark backdrop.

Scale derivation for this data: the ring is r 80 at (368,110), the centre of the 736-wide viewBox, with a 22px
stroke, so its circumference is 2π×80 = 502.7. Each slice is share×C of
dash followed by the rest as gap, minus 2px so the backdrop separates
neighbours, and stroke-dashoffset is minus the run of everything before it.
rotate(−90) moves the start to twelve o'clock. Change the numbers and the five
dasharray pairs are all that move.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Tees are 58% of the 1,450 units sold over the 30 days; everything else trails well behind.</h2>
<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:10px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>Tees 58%</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 82%, transparent)"></span>Hoodies 17%</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 64%, transparent)"></span>Tanks 11%</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 48%, transparent)"></span>Mugs 8%</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 34%, transparent)"></span>Totes 6%</span>
</div>
<div style="position:relative">
  <svg viewBox="0 0 736 220" width="100%" role="img" aria-label="Unit mix over 30 days: tees 58%, hoodies 17%, tanks 11%, mugs 8%, totes 6% of 1,450 units">
    <title>Unit mix over 30 days, tees 58% of 1,450 units</title>
    <!-- scale: ring r 80 at (368,110), the centre of the 736 viewBox, 22px stroke → circumference = 2π×80 = 502.7
         slice_i = share×C, drawn as stroke-dasharray "len-2 rest+2" so a 2px gap of backdrop separates neighbours
         stroke-dashoffset = -(sum of the lengths before it): 0, -291.5, -377.2, -432.6, -472.8
         rotate(-90) starts the first slice at twelve o'clock; shares 58% / 17% / 11% / 8% / 5.9%
         the hit ring is the same geometry at 34px, so the target is wider than the painted arc -->
    <g font-family="var(--font-sans)" font-size="12" fill="var(--chart-label)">
      <g class="m"><circle cx="368" cy="110" r="80" fill="none" stroke="var(--chart-1)" stroke-width="22" stroke-dasharray="289.5 213.1" stroke-dashoffset="0" transform="rotate(-90 368 110)"/><circle cx="368" cy="110" r="80" fill="none" stroke="transparent" stroke-width="34" stroke-dasharray="289.5 213.1" stroke-dashoffset="0" transform="rotate(-90 368 110)" data-label="Tees" data-value="841|58%" data-series="units|of the 1,450"/></g>
      <g class="m"><circle cx="368" cy="110" r="80" fill="none" stroke="color-mix(in srgb, var(--chart-1) 82%, transparent)" stroke-width="22" stroke-dasharray="83.6 419" stroke-dashoffset="-291.5" transform="rotate(-90 368 110)"/><circle cx="368" cy="110" r="80" fill="none" stroke="transparent" stroke-width="34" stroke-dasharray="83.6 419" stroke-dashoffset="-291.5" transform="rotate(-90 368 110)" data-label="Hoodies" data-value="247|17%" data-series="units|of the 1,450"/></g>
      <g class="m"><circle cx="368" cy="110" r="80" fill="none" stroke="color-mix(in srgb, var(--chart-1) 64%, transparent)" stroke-width="22" stroke-dasharray="53.5 449.2" stroke-dashoffset="-377.2" transform="rotate(-90 368 110)"/><circle cx="368" cy="110" r="80" fill="none" stroke="transparent" stroke-width="34" stroke-dasharray="53.5 449.2" stroke-dashoffset="-377.2" transform="rotate(-90 368 110)" data-label="Tanks" data-value="160|11%" data-series="units|of the 1,450"/></g>
      <g class="m"><circle cx="368" cy="110" r="80" fill="none" stroke="color-mix(in srgb, var(--chart-1) 48%, transparent)" stroke-width="22" stroke-dasharray="38.2 464.4" stroke-dashoffset="-432.6" transform="rotate(-90 368 110)"/><circle cx="368" cy="110" r="80" fill="none" stroke="transparent" stroke-width="34" stroke-dasharray="38.2 464.4" stroke-dashoffset="-432.6" transform="rotate(-90 368 110)" data-label="Mugs" data-value="116|8%" data-series="units|of the 1,450"/></g>
      <g class="m"><circle cx="368" cy="110" r="80" fill="none" stroke="color-mix(in srgb, var(--chart-1) 34%, transparent)" stroke-width="22" stroke-dasharray="27.8 474.8" stroke-dashoffset="-472.8" transform="rotate(-90 368 110)"/><circle cx="368" cy="110" r="80" fill="none" stroke="transparent" stroke-width="34" stroke-dasharray="27.8 474.8" stroke-dashoffset="-472.8" transform="rotate(-90 368 110)" data-label="Totes" data-value="86|6%" data-series="units|of the 1,450"/></g>
      <text x="368" y="104" text-anchor="middle" dominant-baseline="middle" fill="var(--foreground)" font-size="28" font-weight="500">1,450</text>
      <text x="368" y="130" text-anchor="middle" dominant-baseline="middle" fill="var(--muted-foreground)">units</text>
    </g>
  </svg>
  <div class="tip" hidden style="position:absolute;left:0;top:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:6px 8px;font-size:12px;color:var(--foreground);pointer-events:none;white-space:nowrap"></div>
</div>
<script>
{ // The hover layer, identical in every chart fragment: the hit target under
  // (or nearest) the pointer fills one tip, the crosshair snaps to its x, and
  // the hovered mark lifts. Pipe-separated data-value/-series/-color list every
  // series at that x in one readout. The block keeps its names to itself, so
  // two charts can share one page.
  const wrap = document.currentScript.previousElementSibling;
  const tip = wrap.querySelector('.tip');
  const panels = [...wrap.querySelectorAll('svg')];
  const hits = panels.flatMap((panel) => [...panel.querySelectorAll('[data-value]')]);
  const el = (tag, css, text) => { const node = document.createElement(tag); node.style.cssText = css; node.textContent = text; return node; };
  let lifted = null;
  const move = (event) => {
    let near = event.target.closest('[data-value]');
    let best = Infinity;
    for (const hit of near ? [] : hits) {
      const box = hit.getBoundingClientRect();
      const away = Math.hypot(event.clientX - (box.left + box.right) / 2, event.clientY - (box.top + box.bottom) / 2);
      if (away < best) { best = away; near = hit; }
    }
    if (!near) { return; }
    const values = near.dataset.value.split('|');
    const names = (near.dataset.series ?? near.dataset.label).split('|');
    const colors = (near.dataset.color ?? '').split('|');
    tip.textContent = '';
    if (values.length > 1) { tip.append(el('div', 'color:var(--muted-foreground);margin-bottom:3px', near.dataset.label)); }
    values.forEach((value, index) => {
      const row = el('div', 'display:flex;align-items:center;gap:6px', '');
      if (colors[index]) { row.append(el('span', 'width:8px;height:8px;border-radius:2px;background:' + colors[index], '')); }
      row.append(el('b', 'font-weight:500;font-variant-numeric:tabular-nums', value), el('span', 'color:var(--muted-foreground)', names[index]));
      tip.append(row);
    });
    tip.hidden = false;
    const area = wrap.getBoundingClientRect();
    tip.style.left = Math.min(Math.max(event.clientX - area.left + 12, 0), area.width - tip.offsetWidth) + 'px';
    tip.style.top = Math.max(0, event.clientY - area.top - tip.offsetHeight - 10) + 'px';
    for (const cross of wrap.querySelectorAll('.crosshair')) { cross.setAttribute('x1', near.dataset.x); cross.setAttribute('x2', near.dataset.x); cross.style.visibility = 'visible'; }
    if (lifted !== near) { lifted?.closest('.m')?.style.removeProperty('opacity'); near.closest('.m')?.style.setProperty('opacity', '0.85'); lifted = near; }
  };
  const leave = () => { tip.hidden = true; lifted?.closest('.m')?.style.removeProperty('opacity'); lifted = null; for (const cross of wrap.querySelectorAll('.crosshair')) { cross.style.visibility = 'hidden'; } };
  for (const panel of panels) { panel.addEventListener('pointermove', move); panel.addEventListener('pointerleave', leave); }
}
</script>
```
