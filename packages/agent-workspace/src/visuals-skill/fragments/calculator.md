# Calculator

Native controls, `step` set on the range, every printed number rounded, and a
readout that updates on `input`. No submit, no fetch.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">At $21.99 a standard tee returns about $2.59 a unit, or $1,038 a month at 400 units.</h2>
<div style="display:grid;gap:var(--gap-md);background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-md)">
  <label style="display:grid;gap:var(--gap-xs)">
    <span style="display:flex;justify-content:space-between;gap:var(--gap-sm)"><span>List price</span><span id="priceOut" style="font-variant-numeric:tabular-nums">$21.99</span></span>
    <input id="price" type="range" min="14.99" max="39.99" step="1" value="21.99">
  </label>
  <label style="display:grid;gap:var(--gap-xs)">
    <span style="display:flex;justify-content:space-between;gap:var(--gap-sm)"><span>Units a month</span><span id="unitsOut" style="font-variant-numeric:tabular-nums">400</span></span>
    <input id="units" type="range" min="50" max="1500" step="50" value="400">
  </label>
  <label style="display:grid;gap:var(--gap-xs)">
    <span>Product</span>
    <select id="product">
      <option value="10.6">Standard tee</option>
      <option value="16.4">Premium tee</option>
      <option value="21.9">Pullover hoodie</option>
    </select>
  </label>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--gap-sm)">
    <div style="background:var(--surface-tertiary);border-radius:var(--radius);padding:var(--pad-sm) var(--pad-md)">
      <div style="font-size:12px;color:var(--muted-foreground)">Royalty per unit</div>
      <div id="unit" style="font-size:24px;font-weight:500;line-height:1.15">$2.59</div>
    </div>
    <div style="background:var(--surface-tertiary);border-radius:var(--radius);padding:var(--pad-sm) var(--pad-md)">
      <div style="font-size:12px;color:var(--muted-foreground)">Royalty a month</div>
      <div id="month" style="font-size:24px;font-weight:500;line-height:1.15">$1,038</div>
    </div>
  </div>
  <div id="warn" style="font-size:12px;color:var(--error)"></div>
</div>
<script>
const price = document.getElementById('price');
const units = document.getElementById('units');
const product = document.getElementById('product');
const recalc = () => {
  const list = Number(price.value);
  const count = Number(units.value);
  const cost = Number(product.value);
  const perUnit = list * 0.6 - cost;
  document.getElementById('priceOut').textContent = '$' + list.toFixed(2);
  document.getElementById('unitsOut').textContent = count.toLocaleString();
  document.getElementById('unit').textContent = (perUnit < 0 ? '-$' : '$') + Math.abs(perUnit).toFixed(2);
  document.getElementById('month').textContent = (perUnit < 0 ? '-$' : '$') + Math.abs(Math.round(perUnit * count)).toLocaleString();
  document.getElementById('warn').textContent = perUnit < 0 ? 'Below the print cost — this price loses money on every unit.' : '';
};
for (const control of [price, units, product]) {
  control.addEventListener('input', recalc);
}
recalc();
</script>
```
