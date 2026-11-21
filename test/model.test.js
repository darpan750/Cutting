import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantitiesForSave, reconcile, sizeTotals, today } from '../src/model.js';

test('reference register reconciliation keeps main and balance metres and pieces separate', () => {
  const result = reconcile([{ metres:'513.750' }],[{
    main_used:'487.860', balance_used:'23.100', waste_metres:'0.000',
    quantities:[{ size_id:1,pieces:564,balance_pieces:22 }],
  }]);
  assert.equal(result.pieces,586);
  assert.equal(result.used,510.96);
  assert.equal(result.remaining,2.79);
  assert.equal(result.average.toFixed(3),'0.872');
  assert.equal(reconcile([{ metres:0.3 }],[{ main_used:0.1,balance_used:0.2,waste_metres:0,quantities:[] }]).remaining,0);
});

test('ratio entry calculates main pieces and carries separately entered balance pieces', () => {
  const sizes = [{ id:1 },{ id:2 }];
  const quantities = { 1:{ ratio:'2',pieces:'17',balance_pieces:'3' } };
  const result = quantitiesForSave({ method:'ratio',layers:'9',quantities },sizes);
  assert.deepEqual(result,[{ size_id:1,ratio:2,pieces:18,balance_pieces:3 }]);
  assert.equal(sizeTotals([{ quantities:result }]).get(1),21);
  assert.equal(quantitiesForSave({ method:'actual',quantities },sizes)[0].pieces,17);
});

test('factory-local date has the format required by date inputs', () => {
  assert.match(today(),/^\d{4}-\d{2}-\d{2}$/);
});
