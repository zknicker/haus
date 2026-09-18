# Choropleth, US states

Revenue by state, projected from the pinned us-atlas topology and keyed by its
own FIPS ids. Change the `revenue` map, the summary sentence, the `aria-label`,
and the words in the failure plate. Bands are equal-count, so the ramp stays
readable however skewed the values are.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">California leads US revenue over the 30 days at $3,447, ahead of Texas at $2,079 and Florida at $1,970.</h2>
<div id="usmap" style="min-height:120px"></div>
<div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:var(--muted-foreground)">
  <span>Less revenue</span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 14%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 32%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 52%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 74%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 96%, transparent)"></span>
  <span>More</span>
</div>
<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, ground] = ['--chart-1', '--background'].map(token);
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const fade = (color, alpha) => {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const pixel = probe.getImageData(0, 0, 1, 1).data;
  return 'rgba(' + pixel[0] + ', ' + pixel[1] + ', ' + pixel[2] + ', ' + alpha + ')';
};
// Keyed by the atlas's own FIPS ids, not by state name.
const revenue = {
  '01': 508, '02': 64, '04': 550, '05': 261, '06': 3447, '08': 486, '09': 281, '10': 89,
  '11': 53, '12': 1970, '13': 1143, '15': 129, '16': 165, '17': 1254, '18': 698, '19': 223,
  '20': 302, '21': 336, '22': 341, '23': 146, '24': 428, '25': 569, '26': 679, '27': 396,
  '28': 267, '29': 629, '30': 107, '31': 189, '32': 221, '33': 126, '34': 795, '35': 156,
  '36': 1967, '37': 749, '38': 76, '39': 853, '40': 278, '41': 394, '42': 1229, '44': 109,
  '45': 527, '46': 90, '47': 672, '48': 2079, '49': 270, '50': 47, '51': 797, '53': 633,
  '54': 141, '55': 569, '56': 46
};
const steps = [0.14, 0.32, 0.52, 0.74, 0.96];
// Equal-count bands, not equal-width: revenue by place is always skewed, and a
// linear ramp would leave forty states in the lightest step.
const sorted = Object.values(revenue).sort((first, second) => first - second);
const at = (fraction) => sorted[Math.floor(fraction * (sorted.length - 1))];
const cuts = [at(0.2), at(0.4), at(0.6), at(0.8)];
const money = (value) => '$' + Math.round(value).toLocaleString();
const host = document.getElementById('usmap');
const fill = (value) =>
  value ? fade(c1, steps[cuts.filter((cut) => value > cut).length]) : 'var(--surface-secondary)';
const stateless = () => {
  const plate = document.createElement('div');
  plate.style.cssText = 'background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md);color:var(--muted-foreground);font-size:13px';
  plate.textContent = 'Map geometry could not load. California leads at $3,447, then Texas $2,079 and Florida $1,970.';
  host.append(plate);
};
fetch('https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json')
  .then((response) => response.json())
  .then((topology) => {
    const states = topojson.feature(topology, topology.objects.states);
    const path = d3.geoPath(d3.geoAlbersUsa().fitSize([700, 420], states));
    const svg = d3
      .select(host)
      .append('svg')
      .attr('viewBox', '0 0 700 420')
      .attr('role', 'img')
      .attr('aria-label', 'US revenue by state over 30 days, California highest at $3,447')
      .style('display', 'block')
      .style('width', '100%')
      .style('height', 'auto');
    svg
      .selectAll('path')
      .data(states.features)
      .join('path')
      .attr('d', path)
      .attr('fill', (feature) => fill(revenue[feature.id]))
      .attr('stroke', ground)
      .attr('stroke-width', 0.75)
      .append('title')
      .text((feature) => feature.properties.name + ': ' + money(revenue[feature.id] ?? 0));
  })
  .catch(stateless);
</script>
```
