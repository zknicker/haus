# Ranked horizontal bar

Top N, sorted, value at the bar end. The value axis goes away entirely — the
numbers are on the bars, so gridlines would only add noise. Long names truncate
in the tick and come back whole in the tooltip.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">The grandson baseball tee leads the last seven days at $234, about 17% ahead of the next product.</h2>
<div style="position:relative;height:400px">
  <canvas id="top" role="img" aria-label="Top eight products by revenue over seven days, led by the grandson baseball tee at $234">Top products: $234, $200, $160, $160, $92, $85, $85, $81.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, label, ink, font] = ['--chart-1', '--chart-label', '--foreground', '--font-sans'].map(token);
const rows = [
  { revenue: 234, title: "That's My Grandson Out There Baseball Grandma" },
  { revenue: 200, title: 'Mama Bee Shirt Family Bee First Bee Day Outfits' },
  { revenue: 160, title: 'Family Bee Shirts Dad Daddy First Bee Day Outfit' },
  { revenue: 160, title: 'Mermaid Security Shirt Swimmer Dad Merdad Trident' },
  { revenue: 92, title: 'Halloween Ghost Reading Read More Books Librarian' },
  { revenue: 85, title: 'I Need Baseball And Jesus Sports Mom Gift' },
  { revenue: 85, title: "I'm Not Gay I'm Super Gay LGBT Pride Rainbow" },
  { revenue: 81, title: 'Boss Of The Toss Funny Cornhole Gifts For Men' }
];
const money = (value) => '$' + Math.round(value).toLocaleString();
const clip = (text) => (text.length > 30 ? text.slice(0, 29) + '…' : text);
const ends = {
  id: 'ends',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = ink;
    ctx.font = '500 12px ' + font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const [index, bar] of chart.getDatasetMeta(0).data.entries()) {
      ctx.fillText(money(rows[index].revenue), bar.x + 8, bar.y);
    }
    ctx.restore();
  }
};
new Chart(document.getElementById('top'), {
  type: 'bar',
  data: { labels: rows.map((row) => row.title), datasets: [{ data: rows.map((row) => row.revenue), backgroundColor: c1, borderRadius: 4, maxBarThickness: 48 }] },
  options: {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    layout: { padding: { right: 52 } },
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => money(item.parsed.x) } } },
    datasets: { bar: { barPercentage: 0.9, categoryPercentage: 0.7 } },
    scales: {
      x: { display: false, beginAtZero: true },
      y: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, color: label, font: { family: font, size: 12 }, callback: (value, index) => clip(rows[index].title) } }
    }
  },
  plugins: [ends]
});
</script>
```
