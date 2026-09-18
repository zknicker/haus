# Choropleth, world countries

Antarctica is dropped — it is a third of the projection's height and never has
data. Three marketplaces means most of the map is "no sales", which is itself
the answer, so the legend names that step.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">The US is 94% of revenue over the 30 days; Germany and the United Kingdom are the only other marketplaces selling.</h2>
<div id="worldmap" style="min-height:120px"></div>
<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:var(--muted-foreground)">
  <span>Less revenue</span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 35%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 65%, transparent)"></span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 96%, transparent)"></span>
  <span style="margin-right:var(--gap-sm)">More</span>
  <span style="width:14px;height:14px;border-radius:calc(var(--radius) / 3);background:var(--surface-secondary)"></span>
  <span>No sales</span>
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
// Numeric ISO 3166-1 ids, the atlas's own keys: US, Germany, United Kingdom.
const revenue = { '276': 1058, '826': 866, '840': 27954 };
// Three values, so three equal-count bands — and the lightest still has to read
// against a dark ground, which is why the ramp starts at 35% and not at 14%.
const steps = [0.35, 0.65, 0.96];
const sorted = Object.values(revenue).sort((first, second) => first - second);
const at = (fraction) => sorted[Math.floor(fraction * (sorted.length - 1))];
const cuts = [at(1 / 3), at(2 / 3)];
const money = (value) => '$' + Math.round(value).toLocaleString();
const host = document.getElementById('worldmap');
const fill = (value) =>
  value ? fade(c1, steps[cuts.filter((cut) => value > cut).length]) : 'var(--surface-secondary)';
const stateless = () => {
  const plate = document.createElement('div');
  plate.style.cssText = 'background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md);color:var(--muted-foreground);font-size:13px';
  plate.textContent = 'Map geometry could not load. US $27,954, Germany $1,058, United Kingdom $866 over the 30 days.';
  host.append(plate);
};
fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json')
  .then((response) => response.json())
  .then((topology) => {
    const world = topojson.feature(topology, topology.objects.countries);
    const countries = world.features.filter((feature) => feature.id !== '010');
    const shown = { features: countries, type: 'FeatureCollection' };
    const path = d3.geoPath(d3.geoNaturalEarth1().fitSize([700, 340], shown));
    const svg = d3
      .select(host)
      .append('svg')
      .attr('viewBox', '0 0 700 340')
      .attr('role', 'img')
      .attr('aria-label', 'Revenue by marketplace over 30 days: the US $27,954, Germany $1,058, the United Kingdom $866')
      .style('display', 'block')
      .style('width', '100%')
      .style('height', 'auto');
    svg
      .selectAll('path')
      .data(countries)
      .join('path')
      .attr('d', path)
      .attr('fill', (feature) => fill(revenue[feature.id]))
      .attr('stroke', ground)
      .attr('stroke-width', 0.75)
      .append('title')
      .text((feature) => feature.properties.name + ': ' + (revenue[feature.id] ? money(revenue[feature.id]) : 'no sales'));
  })
  .catch(stateless);
</script>
```
