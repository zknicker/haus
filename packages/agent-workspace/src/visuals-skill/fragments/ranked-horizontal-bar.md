# Ranked horizontal bar

Top N, sorted, name on the left and value on the right — the shape people
actually read a leaderboard in. The value axis goes away entirely: every bar is
labelled, so gridlines would only add ink. Long names are shortened for the
label and kept whole on the hit target, so the tip returns the full title.

Scale derivation for this data: there is no y scale to derive — rows are fixed
at 28px with a 20px bar, so y_i = 10 + 28i + 4. The value scale is the only
math: the leader is $234, which rounds to a $240 ceiling, and bars run from
x 164 to x 680 (516px), so x(v) = 164 + v/240×516. Eight rows at 28px plus the
pads make the viewBox 242 tall; add a row and the height grows by 28.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">The grandson baseball tee leads the last seven days at $234, about 17% ahead of the next product.</h2>
<div style="position:relative">
  <svg viewBox="0 0 736 242" width="100%" role="img" aria-label="Top eight products by revenue over seven days, led by the grandson baseball tee at $234">
    <title>Top products by revenue, grandson baseball tee at $234</title>
    <!-- scale: no value axis — every bar is labelled, so gridlines would only add ink.
         name column 0→156, bars 164→680, values right-aligned at 732; plotW 516
         n = 8, rowH = 28, barH = 20 (under the 24px cap), y_i = 10 + 28*i + (28 - 20)/2 = 14, 42, …
         max $240 → x(v) = 164 + v/240*516, so $234 ends at 667.1 and $81 at 338.2 -->
    <g font-family="var(--font-sans)" font-size="12" fill="var(--chart-label)">
      <g class="m"><text x="0" y="24" dominant-baseline="middle" fill="var(--foreground)">Grandson baseball</text><path d="M 164,14 H 663.1 a4 4 0 0 1 4,4 V 30 a4 4 0 0 1 -4,4 H 164 Z" fill="var(--chart-1)"/><text x="732" y="24" text-anchor="end" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">$234</text><rect x="0" y="10" width="736" height="28" fill="transparent" data-label="Grandson baseball" data-series="That's My Grandson Out There Baseball Grandma" data-value="$234"/></g>
      <g class="m"><text x="0" y="52" dominant-baseline="middle" fill="var(--foreground)">Mama bee family</text><path d="M 164,42 H 590 a4 4 0 0 1 4,4 V 58 a4 4 0 0 1 -4,4 H 164 Z" fill="var(--chart-1)"/><text x="732" y="52" text-anchor="end" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">$200</text><rect x="0" y="38" width="736" height="28" fill="transparent" data-label="Mama bee family" data-series="Mama Bee Shirt Family Bee First Bee Day Outfits" data-value="$200"/></g>
      <g class="m"><text x="0" y="80" dominant-baseline="middle" fill="var(--foreground)">Dad bee family</text><path d="M 164,70 H 504 a4 4 0 0 1 4,4 V 86 a4 4 0 0 1 -4,4 H 164 Z" fill="var(--chart-1)"/><text x="732" y="80" text-anchor="end" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">$160</text><rect x="0" y="66" width="736" height="28" fill="transparent" data-label="Dad bee family" data-series="Family Bee Shirts Dad Daddy First Bee Day Outfit" data-value="$160"/></g>
      <g class="m"><text x="0" y="108" dominant-baseline="middle" fill="var(--foreground)">Mermaid security</text><path d="M 164,98 H 504 a4 4 0 0 1 4,4 V 114 a4 4 0 0 1 -4,4 H 164 Z" fill="var(--chart-1)"/><text x="732" y="108" text-anchor="end" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">$160</text><rect x="0" y="94" width="736" height="28" fill="transparent" data-label="Mermaid security" data-series="Mermaid Security Shirt Swimmer Dad Merdad Trident" data-value="$160"/></g>
      <g class="m"><text x="0" y="136" dominant-baseline="middle" fill="var(--foreground)">Ghost reading</text><path d="M 164,126 H 357.8 a4 4 0 0 1 4,4 V 142 a4 4 0 0 1 -4,4 H 164 Z" fill="var(--chart-1)"/><text x="732" y="136" text-anchor="end" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">$92</text><rect x="0" y="122" width="736" height="28" fill="transparent" data-label="Ghost reading" data-series="Halloween Ghost Reading Read More Books Librarian" data-value="$92"/></g>
      <g class="m"><text x="0" y="164" dominant-baseline="middle" fill="var(--foreground)">Baseball and Jesus</text><path d="M 164,154 H 342.8 a4 4 0 0 1 4,4 V 170 a4 4 0 0 1 -4,4 H 164 Z" fill="var(--chart-1)"/><text x="732" y="164" text-anchor="end" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">$85</text><rect x="0" y="150" width="736" height="28" fill="transparent" data-label="Baseball and Jesus" data-series="I Need Baseball And Jesus Sports Mom Gift" data-value="$85"/></g>
      <g class="m"><text x="0" y="192" dominant-baseline="middle" fill="var(--foreground)">Super gay pride</text><path d="M 164,182 H 342.8 a4 4 0 0 1 4,4 V 198 a4 4 0 0 1 -4,4 H 164 Z" fill="var(--chart-1)"/><text x="732" y="192" text-anchor="end" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">$85</text><rect x="0" y="178" width="736" height="28" fill="transparent" data-label="Super gay pride" data-series="I'm Not Gay I'm Super Gay LGBT Pride Rainbow" data-value="$85"/></g>
      <g class="m"><text x="0" y="220" dominant-baseline="middle" fill="var(--foreground)">Boss of the toss</text><path d="M 164,210 H 334.2 a4 4 0 0 1 4,4 V 226 a4 4 0 0 1 -4,4 H 164 Z" fill="var(--chart-1)"/><text x="732" y="220" text-anchor="end" dominant-baseline="middle" fill="var(--muted-foreground)" style="font-variant-numeric: tabular-nums">$81</text><rect x="0" y="206" width="736" height="28" fill="transparent" data-label="Boss of the toss" data-series="Boss Of The Toss Funny Cornhole Gifts For Men" data-value="$81"/></g>
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
