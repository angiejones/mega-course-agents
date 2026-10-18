import { writeFileSync } from 'node:fs';
// Reproducible catalog with varied prices, sizes and availability, not sorted by price.
let state = 48271;
function random(n: number) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; }
const products = [];
const styles = ['Ridge','Summit','Coastal','Forest','Alpine','Valley','River','Urban','Trail','Highland'];
for (const category of ['rain-jacket', 'backpack'] as const) {
  for (let index = 1; index <= 120; index++) {
    const id = `${category}-${String(index).padStart(3, '0')}`;
    const name = `${styles[random(styles.length)]} ${category === 'rain-jacket' ? 'rain jacket' : 'backpack'} ${index}`;
    const base = category === 'rain-jacket' ? 4900 + random(14000) : 2900 + random(10000);
    const sizes = category === 'rain-jacket' ? ['S','M','L','XL'] : ['20L','30L'];
    const variants = sizes.map(size => ({ sku: `${id}-${size.toLowerCase()}`, productId: id, name, category, size,
      priceCents: base + random(2000), currency: 'USD', stock: random(5) === 0 ? 0 : 1 + random(20) }));
    products.push({id,name,category,variants});
  }
}
writeFileSync('fixtures/catalog/large-trip-products.json', JSON.stringify(products,null,2)+'\n');
console.log(`${products.length} products, ${products.flatMap(p=>p.variants).length} variants`);
