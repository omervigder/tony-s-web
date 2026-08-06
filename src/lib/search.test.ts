/** Tests for the shared product search — run with `npm test`.
 *
 *  Small as it is, this decides what a shopper is shown when they type, and it
 *  now backs every product picker in the admin panel too. Same house style as
 *  the cart tests: `node:assert` under tsx, no framework. */
import assert from 'node:assert/strict';
import { matchesSearch, filterByName } from './search';

let n = 0;
const check = (label: string, fn: () => void) => { fn(); n++; console.log('  ok  ', label); };

console.log('\nmatching');
check('empty term matches everything', () => {
  assert.equal(matchesSearch('נר ריחני לבנדר', ''), true);
  assert.equal(matchesSearch('נר ריחני לבנדר', '   '), true);
});
check('substring matches', () => {
  assert.equal(matchesSearch('נר ריחני לבנדר', 'לבנדר'), true);
  assert.equal(matchesSearch('נר ריחני לבנדר', 'ריח'), true);
});
check('a word that is not there does not match', () => {
  assert.equal(matchesSearch('נר ריחני לבנדר', 'ורד'), false);
});
check('words match in any order', () => {
  assert.equal(matchesSearch('נר ריחני לבנדר', 'לבנדר נר'), true);
});
check('every word has to appear, not just one', () => {
  assert.equal(matchesSearch('נר ריחני לבנדר', 'נר ורד'), false);
});
check('case is ignored', () => {
  assert.equal(matchesSearch('Lavender Candle', 'lavender'), true);
  assert.equal(matchesSearch('lavender candle', 'CANDLE'), true);
});
check('surrounding and repeated spaces are ignored', () => {
  assert.equal(matchesSearch('נר ריחני לבנדר', '  נר   לבנדר  '), true);
});
check('a missing name is not a crash', () => {
  assert.equal(matchesSearch(undefined as unknown as string, 'נר'), false);
  assert.equal(matchesSearch(undefined as unknown as string, ''), true);
});

console.log('\nfiltering');
const catalog = [
  { id: '1', name: 'נר ריחני לבנדר' },
  { id: '2', name: 'נר ריחני ורד' },
  { id: '3', name: 'סבון טבעי' },
];
check('an empty term returns the list untouched', () => {
  assert.equal(filterByName(catalog, ''), catalog);
});
check('narrows to the matches', () => {
  assert.deepEqual(filterByName(catalog, 'נר').map(p => p.id), ['1', '2']);
  assert.deepEqual(filterByName(catalog, 'ורד').map(p => p.id), ['2']);
});
check('no match is an empty list, never everything', () => {
  assert.deepEqual(filterByName(catalog, 'שמפו'), []);
});
check('order is preserved', () => {
  assert.deepEqual(filterByName(catalog, 'ריחני').map(p => p.id), ['1', '2']);
});

console.log(`\n${n} assertions passed\n`);
