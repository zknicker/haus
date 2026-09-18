# Multi-line

Up to four independent series in categorical order — blue, violet, green, then
red last — named at the line end by a dot in the series color beside neutral
text, because the text never wears the color. Red is the fourth hue, so the
direct labels are what carry identity once it appears. Past four series, split
the chart.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Harvest tees hold the lowest ACOS at 17%, while the holiday push climbed to 41% over the last eight weeks.</h2>
<div style="position:relative;height:260px">
  <canvas id="acos" role="img" aria-label="Weekly ACOS for four campaigns, harvest tees lowest at 17% and holiday push highest at 41%">Week 8 ACOS: harvest tees 17%, bee family 24%, dog lovers 31%, holiday push 41%.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, c2, c3, c4, grid, label, muted, ground, font] = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-grid', '--chart-label', '--muted-foreground', '--background', '--font-sans'].map(token);
const campaigns = [
  { color: c1, name: 'Harvest tees', values: [24, 23, 21, 22, 20, 19, 18, 17] },
  { color: c4, name: 'Bee family', values: [21, 22, 24, 23, 25, 24, 25, 24] },
  { color: c3, name: 'Dog lovers', values: [29, 28, 30, 29, 31, 30, 32, 31] },
  { color: c2, name: 'Holiday push', values: [33, 34, 36, 35, 38, 39, 40, 41] }
];
const percent = (value) => Math.round(value) + '%';
const endNames = {
  id: 'endNames',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = '12px ' + font;
    ctx.textBaseline = 'middle';
    for (const [index, campaign] of campaigns.entries()) {
      const point = chart.getDatasetMeta(index).data.at(-1);
      ctx.fillStyle = campaign.color;
      ctx.beginPath();
      ctx.arc(point.x + 10, point.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = muted;
      ctx.textAlign = 'left';
      ctx.fillText(campaign.name, point.x + 18, point.y);
    }
    ctx.restore();
  }
};
new Chart(document.getElementById('acos'), {
  type: 'line',
  data: {
    labels: ['Jul 21', 'Jul 28', 'Aug 4', 'Aug 11', 'Aug 18', 'Aug 25', 'Sep 1', 'Sep 8'],
    datasets: campaigns.map((campaign) => ({ label: campaign.name, data: campaign.values, borderColor: campaign.color, borderWidth: 2, tension: 0, pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: campaign.color, pointBorderColor: ground, pointBorderWidth: 2, hitRadius: 12 }))
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    layout: { padding: { right: 108 } },
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => item.dataset.label + ': ' + percent(item.parsed.y) } } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxRotation: 0, maxTicksLimit: 8 } },
      y: { beginAtZero: true, max: 50, grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, stepSize: 10, callback: (value) => percent(value) } }
    }
  },
  plugins: [endNames]
});
</script>
```
