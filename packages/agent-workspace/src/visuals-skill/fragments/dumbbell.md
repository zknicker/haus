# Dumbbell

Before against after, one row per item. No scale engine needed: HTML positions
both dots as a percentage of the row, so the labels stay real text at real
sizes. The connector is the story — length is the change.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Four of five products gained units after the September price cut; only the mermaid tee slipped.</h2>
<div style="display:flex;gap:16px;margin-bottom:10px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:50%;background:color-mix(in srgb, var(--chart-1) 38%, transparent)"></span>August</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:50%;background:var(--chart-1)"></span>September</span>
</div>
<div style="display:grid;gap:var(--gap-sm)" id="dumbbell"></div>
<script>
const rows = [
  { after: 148, before: 96, name: 'Grandson baseball tee' },
  { after: 121, before: 88, name: 'Bee family tee' },
  { after: 74, before: 41, name: 'Dog lovers tee' },
  { after: 39, before: 24, name: 'Cornhole tee' },
  { after: 38, before: 47, name: 'Mermaid security tee' }
];
const max = Math.ceil(Math.max(...rows.flatMap((row) => [row.before, row.after])) / 20) * 20;
const at = (value) => (value / max) * 100;
const host = document.getElementById('dumbbell');
for (const row of rows) {
  const line = document.createElement('div');
  line.style.cssText = 'display:grid;grid-template-columns:minmax(0,150px) minmax(0,1fr) 52px;align-items:center;gap:var(--gap-sm)';
  const name = document.createElement('div');
  name.style.cssText = 'font-size:12px;color:var(--muted-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  name.textContent = row.name;
  name.title = row.name;
  const track = document.createElement('div');
  track.style.cssText = 'position:relative;height:16px';
  const low = Math.min(at(row.before), at(row.after));
  const span = Math.abs(at(row.after) - at(row.before));
  track.innerHTML = '<div style="position:absolute;top:7px;left:0;right:0;height:1px;background:var(--border)"></div>'
    + '<div style="position:absolute;top:6.5px;left:' + low + '%;width:' + span + '%;height:3px;border-radius:2px;background:color-mix(in srgb, var(--chart-1) 45%, transparent)"></div>'
    + '<div style="position:absolute;top:2px;left:calc(' + at(row.before) + '% - 6px);width:12px;height:12px;border-radius:50%;background:color-mix(in srgb, var(--chart-1) 38%, transparent)"></div>'
    + '<div style="position:absolute;top:2px;left:calc(' + at(row.after) + '% - 6px);width:12px;height:12px;border-radius:50%;background:var(--chart-1);border:2px solid var(--background)"></div>';
  const delta = row.after - row.before;
  const change = document.createElement('div');
  change.style.cssText = 'justify-self:end;padding:1px 6px;border-radius:var(--radius);font-size:12px;font-variant-numeric:tabular-nums';
  change.style.background = delta < 0 ? 'var(--error-bg)' : 'var(--success-bg)';
  change.style.color = delta < 0 ? 'var(--error-foreground)' : 'var(--success-foreground)';
  change.textContent = (delta < 0 ? '-' : '+') + Math.abs(delta);
  line.append(name, track, change);
  host.append(line);
}
</script>
```
