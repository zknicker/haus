# Diverging bar

Movement either side of a baseline. The axis is the change, not the level, so
the labels carry their sign and the zero line is the only rule on the plot.
Gains run right in `--chart-1`, losses left in `--chart-2`: the two poles are
one cool and one warm hue, because two cool hues do not read as opposite.

Scale derivation for this data: names sit in 0→140, the plot in 152→700 (the
right edge stops short so the +$100 tick clears the viewBox), and the zero line
splits it at 426 with 274px per arm. The step comes from the whole span:
the biggest swing is −$84, so the axis spans 168 and niceStep gives step 50;
the max, the first multiple at or above $84, is 100, mirrored so both arms run
to ±$100. Symmetry matters more than tightness here; otherwise a −$84 bar and a
+$62 bar would be drawn the same length. x(v) = 426 + v/100×274. Six rows at
34px plus the label band make the viewBox 238 tall.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Four products gained on last week and two lost; the mermaid tee swung furthest, down $84.</h2>
<div style="position:relative">
  <svg viewBox="0 0 736 238" width="100%" role="img" aria-label="Revenue change against last week per product, four up and two down, the mermaid tee furthest down at minus $84">
    <title>Revenue change against last week, mermaid tee down $84</title>
    <!-- scale: names 0→140, plot 152→700 around a shared zero at 426; half-width 274
         peak (the biggest swing) $84, span 168 → step = smallest of 1, 2, 5 × 10^k at or above span/5 (33.6) = 50 → max = first multiple at or above the peak = 100 → step 50 · max 100 · mirrored, x(v) = 426 + v/100*274
         ticks -$100 / -$50 / $0 / +$50 / +$100, 137px apart
         n = 6, rowH = 34, barH = 20, y_i = 8 + 34*i + (34 - 20)/2 = 15, 49, …
         the only rule is the hairline at zero; gains run right in --chart-1, losses left in --chart-2 -->
    <g font-family="var(--font-sans)" font-size="12" fill="var(--chart-label)">
      <g class="m"><text x="0" y="25" dominant-baseline="middle" fill="var(--foreground)">Grandson baseball</text><path d="M 426,15 H 591.9 a4 4 0 0 1 4,4 V 31 a4 4 0 0 1 -4,4 H 426 Z" fill="var(--chart-1)"/><text x="603.9" y="25" text-anchor="start" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">+$62</text><rect x="152" y="8" width="548" height="34" fill="transparent" data-label="Grandson baseball" data-series="Grandson baseball tee" data-value="+$62"/></g>
      <g class="m"><text x="0" y="59" dominant-baseline="middle" fill="var(--foreground)">Bee family</text><path d="M 426,49 H 553.5 a4 4 0 0 1 4,4 V 65 a4 4 0 0 1 -4,4 H 426 Z" fill="var(--chart-1)"/><text x="565.5" y="59" text-anchor="start" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">+$48</text><rect x="152" y="42" width="548" height="34" fill="transparent" data-label="Bee family" data-series="Bee family tee" data-value="+$48"/></g>
      <g class="m"><text x="0" y="93" dominant-baseline="middle" fill="var(--foreground)">Cornhole</text><path d="M 426,83 H 506.9 a4 4 0 0 1 4,4 V 99 a4 4 0 0 1 -4,4 H 426 Z" fill="var(--chart-1)"/><text x="518.9" y="93" text-anchor="start" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">+$31</text><rect x="152" y="76" width="548" height="34" fill="transparent" data-label="Cornhole" data-series="Cornhole tee" data-value="+$31"/></g>
      <g class="m"><text x="0" y="127" dominant-baseline="middle" fill="var(--foreground)">Ghost reading</text><path d="M 426,117 H 454.9 a4 4 0 0 1 4,4 V 133 a4 4 0 0 1 -4,4 H 426 Z" fill="var(--chart-1)"/><text x="466.9" y="127" text-anchor="start" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">+$12</text><rect x="152" y="110" width="548" height="34" fill="transparent" data-label="Ghost reading" data-series="Ghost reading tee" data-value="+$12"/></g>
      <g class="m"><text x="0" y="161" dominant-baseline="middle" fill="var(--foreground)">Dog lovers</text><path d="M 426,151 H 328.6 a4 4 0 0 0 -4,4 V 167 a4 4 0 0 0 4,4 H 426 Z" fill="var(--chart-2)"/><text x="316.6" y="161" text-anchor="end" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">-$37</text><rect x="152" y="144" width="548" height="34" fill="transparent" data-label="Dog lovers" data-series="Dog lovers tee" data-value="-$37"/></g>
      <g class="m"><text x="0" y="195" dominant-baseline="middle" fill="var(--foreground)">Mermaid security</text><path d="M 426,185 H 199.8 a4 4 0 0 0 -4,4 V 201 a4 4 0 0 0 4,4 H 426 Z" fill="var(--chart-2)"/><text x="187.8" y="195" text-anchor="end" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">-$84</text><rect x="152" y="178" width="548" height="34" fill="transparent" data-label="Mermaid security" data-series="Mermaid security tee" data-value="-$84"/></g>
      <line x1="426" y1="8" x2="426" y2="212" stroke="var(--border-strong)" stroke-width="1"/>
      <text x="152" y="230" text-anchor="middle">-$100</text>
      <text x="289" y="230" text-anchor="middle">-$50</text>
      <text x="426" y="230" text-anchor="middle">$0</text>
      <text x="563" y="230" text-anchor="middle">+$50</text>
      <text x="700" y="230" text-anchor="middle">+$100</text>
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
