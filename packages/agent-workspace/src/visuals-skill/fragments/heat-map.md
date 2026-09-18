# Heat map

Weekday against week, in pure HTML and CSS — a grid of cells needs no chart
library and keeps every label as real text. Five sequential steps of one hue,
plus a plate for a zero cell, and a scale legend so the steps mean something.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Fridays and Saturdays carry the week — every Saturday lands in the top two bands, and Mondays and Tuesdays sit at the bottom of the range.</h2>
<div style="display:grid;grid-template-columns:34px repeat(6, minmax(0, 1fr));gap:3px;font-size:11px" id="heat"></div>
<div style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:var(--muted-foreground)">
  <span>Fewer units</span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 14%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 32%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 52%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 74%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 96%, transparent)"></span>
  <span>More</span>
</div>
<script>
const weeks = ['Aug 11', 'Aug 18', 'Aug 25', 'Sep 1', 'Sep 8', 'Sep 15'];
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const units = [
  [38, 41, 36, 44, 39, 42],
  [34, 36, 39, 37, 41, 35],
  [42, 45, 40, 47, 44, 0],
  [47, 51, 46, 53, 49, 0],
  [63, 68, 57, 71, 66, 0],
  [72, 79, 64, 77, 73, 0],
  [48, 52, 44, 51, 46, 0]
];
const steps = [14, 32, 52, 74, 96];
// Band across the observed range, not from zero: scaling a 34–79 spread against
// zero would push every cell into the middle two steps and waste the ramp.
const seen = units.flat().filter((value) => value > 0);
const low = Math.min(...seen);
const high = Math.max(...seen);
const host = document.getElementById('heat');
const cell = (style, text, title) => {
  const box = document.createElement('div');
  box.style.cssText = style;
  box.textContent = text;
  if (title) { box.title = title; }
  host.append(box);
};
cell('', '');
for (const week of weeks) {
  cell('text-align:center;color:var(--muted-foreground);padding-bottom:2px', week);
}
for (const [row, day] of days.entries()) {
  cell('display:flex;align-items:center;color:var(--muted-foreground)', day);
  for (const [column, week] of weeks.entries()) {
    const value = units[row][column];
    const band = Math.min(steps.length - 1, Math.floor(((value - low) / (high - low + 1)) * steps.length));
    const fill = value === 0 ? 'var(--surface-secondary)' : 'color-mix(in srgb, var(--chart-1) ' + steps[band] + '%, transparent)';
    cell('height:30px;border-radius:calc(var(--radius) / 3);background:' + fill, '', day + ' ' + week + ': ' + (value === 0 ? 'no data yet' : value + ' units'));
  }
}
</script>
```
