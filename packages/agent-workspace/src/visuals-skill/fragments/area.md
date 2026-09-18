# Area

One series where the volume is the point. Canvas cannot parse `color-mix()`, so
paint the token onto a 1px canvas and read the pixel back — the one helper that
works whether the theme resolves the token to hex or to `oklch()`.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Royalties totalled $5,791 over the 30 days and ended the period at $218 a day.</h2>
<div style="position:relative;height:240px">
  <canvas id="royalties" role="img" aria-label="Daily royalties over 30 days, totalling $5,791 and ending at $218">Daily royalties ran $121 to $283 and totalled $5,791.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, grid, label, ground, font] = ['--chart-1', '--chart-grid', '--chart-label', '--background', '--font-sans'].map(token);
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const fade = (color, alpha) => {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const pixel = probe.getImageData(0, 0, 1, 1).data;
  return 'rgba(' + pixel[0] + ', ' + pixel[1] + ', ' + pixel[2] + ', ' + alpha + ')';
};
const days = ['Aug 17', 'Aug 18', 'Aug 19', 'Aug 20', 'Aug 21', 'Aug 22', 'Aug 23', 'Aug 24', 'Aug 25', 'Aug 26', 'Aug 27', 'Aug 28', 'Aug 29', 'Aug 30', 'Aug 31', 'Sep 1', 'Sep 2', 'Sep 3', 'Sep 4', 'Sep 5', 'Sep 6', 'Sep 7', 'Sep 8', 'Sep 9', 'Sep 10', 'Sep 11', 'Sep 12', 'Sep 13', 'Sep 14', 'Sep 15'];
const royalties = [166, 128, 181, 219, 283, 243, 121, 184, 213, 127, 191, 206, 242, 165, 149, 188, 204, 174, 231, 259, 192, 161, 176, 209, 236, 183, 168, 205, 245, 218];
const money = (value) => '$' + Math.round(value).toLocaleString();
new Chart(document.getElementById('royalties'), {
  type: 'line',
  data: { labels: days, datasets: [{ label: 'Royalties', data: royalties, borderColor: c1, borderWidth: 2, tension: 0, fill: true, backgroundColor: fade(c1, 0.1), pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: c1, pointBorderColor: ground, pointBorderWidth: 2, hitRadius: 12 }] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => money(item.parsed.y) } } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxRotation: 0, maxTicksLimit: 6 } },
      y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 5, callback: (value) => money(value) } }
    }
  }
});
</script>
```
