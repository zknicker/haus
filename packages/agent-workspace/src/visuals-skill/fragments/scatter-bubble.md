# Scatter and bubble

Two measures against each other, one bubble per campaign sized by units.
`grace: '10%'` keeps air on every side without forcing ugly end ticks, each
point is ringed in the backdrop, and the hover radius is one a finger could
hit. Scatter has no series to name, so the one label goes on the extreme.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Spend and ACOS barely track each other: the two biggest spenders sit at opposite ends of efficiency.</h2>
<div style="position:relative;height:280px">
  <canvas id="spend" role="img" aria-label="Campaign spend against ACOS, with the largest spender also the least efficient at 41%">Harvest tees $410 at 17%, bee family $530 at 24%, dog lovers $290 at 31%, holiday push $780 at 41%, cornhole $160 at 28%, mermaid $240 at 22%.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, grid, label, ink, ground, font] = ['--chart-1', '--chart-grid', '--chart-label', '--foreground', '--background', '--font-sans'].map(token);
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const fade = (color, alpha) => {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const pixel = probe.getImageData(0, 0, 1, 1).data;
  return 'rgba(' + pixel[0] + ', ' + pixel[1] + ', ' + pixel[2] + ', ' + alpha + ')';
};
const campaigns = [
  { acos: 17, name: 'Harvest tees', spend: 410, units: 96 },
  { acos: 24, name: 'Bee family', spend: 530, units: 88 },
  { acos: 31, name: 'Dog lovers', spend: 290, units: 41 },
  { acos: 41, name: 'Holiday push', spend: 780, units: 74 },
  { acos: 28, name: 'Cornhole', spend: 160, units: 24 },
  { acos: 22, name: 'Mermaid', spend: 240, units: 47 }
];
const worst = campaigns.reduce((leader, campaign) => (campaign.acos > leader.acos ? campaign : leader));
const callout = {
  id: 'callout',
  afterDatasetsDraw(chart) {
    const index = campaigns.indexOf(worst);
    const point = chart.getDatasetMeta(0).data[index];
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = ink;
    ctx.font = '500 12px ' + font;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(worst.name + ' ' + worst.acos + '%', point.x - point.options.radius - 8, point.y + 5);
    ctx.restore();
  }
};
new Chart(document.getElementById('spend'), {
  type: 'bubble',
  data: { datasets: [{ label: 'Campaigns', data: campaigns.map((campaign) => ({ campaign: campaign.name, r: Math.max(6, Math.round(Math.sqrt(campaign.units) * 1.4)), x: campaign.spend, y: campaign.acos })), backgroundColor: fade(c1, 0.55), borderColor: ground, borderWidth: 2, hoverBackgroundColor: c1 }] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'nearest' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => item.raw.campaign + ': $' + Math.round(item.raw.x).toLocaleString() + ' spend, ' + Math.round(item.raw.y) + '% ACOS' } } },
    scales: {
      x: { grace: '10%', grid: { display: false }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 6, callback: (value) => '$' + Math.round(value).toLocaleString() } },
      y: { grace: '10%', grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 5, callback: (value) => Math.round(value) + '%' } }
    }
  },
  plugins: [callout]
});
</script>
```
