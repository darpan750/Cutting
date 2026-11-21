export function today() {
  const parts = new Intl.DateTimeFormat('en',{ timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
  const fields = Object.fromEntries(parts.map(part => [part.type,part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}
export const number = value => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(Number(value || 0));
export const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
export const dateLabel = value => value ? value.slice(0, 10).split('-').reverse().join('/') : '—';
export const timeLabel = value => new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));
export const roundMetres = value => Math.round((value + Number.EPSILON) * 1000) / 1000;

export function fieldVisible(settings, entity, key) {
  return !settings?.hidden_fields?.includes(`${entity}.${key}`);
}

export function fieldLabel(settings, entity, key, fallback) {
  return settings?.field_labels?.[`${entity}.${key}`] || fallback;
}

export function visibleFacts(settings, entity, rows) {
  return rows.filter(([key]) => fieldVisible(settings,entity,key))
    .map(([key,label,value]) => [fieldLabel(settings,entity,key,label),value]);
}

export function reconcile(batches, cuts) {
  const result = { inward: 0, main: 0, balance: 0, used: 0, waste: 0, remaining: 0, mainPieces: 0, balancePieces: 0, pieces: 0, average: null };
  for (const batch of batches) result.inward += Math.round(Number(batch.metres) * 1000);
  for (const cut of cuts) {
    result.main += Math.round(Number(cut.main_used) * 1000);
    result.balance += Math.round(Number(cut.balance_used) * 1000);
    result.waste += Math.round(Number(cut.waste_metres) * 1000);
    for (const row of cut.quantities) {
      result.mainPieces += Number(row.pieces);
      result.balancePieces += Number(row.balance_pieces);
    }
  }
  result.used = result.main + result.balance;
  result.remaining = result.inward - result.used - result.waste;
  for (const key of ['inward', 'main', 'balance', 'used', 'waste', 'remaining']) result[key] /= 1000;
  result.pieces = result.mainPieces + result.balancePieces;
  if (result.pieces) result.average = result.used / result.pieces;
  return result;
}

export function sizeTotals(cuts) {
  const totals = new Map();
  for (const cut of cuts) {
    for (const row of cut.quantities) {
      totals.set(row.size_id, (totals.get(row.size_id) || 0) + Number(row.pieces) + Number(row.balance_pieces));
    }
  }
  return totals;
}

export function quantitiesForSave(draft, sizes) {
  return sizes.map(size => {
    const row = draft.quantities?.[size.id] || {};
    return {
      size_id: size.id,
      ratio: Number(row.ratio || 0),
      pieces: draft.method === 'ratio' ? Number(row.ratio || 0) * Number(draft.layers || 0) : Number(row.pieces || 0),
      balance_pieces: Number(row.balance_pieces || 0),
    };
  }).filter(row => row.ratio || row.pieces || row.balance_pieces);
}

export function readableError(error) {
  if (error.code === '23505') return 'That lot number, colour or size already exists.';
  if (error.code === '23503') return 'This record is linked to another record, or the selected record no longer exists.';
  if (['23502', '23514', '22P02', '22003'].includes(error.code)) return 'Check the required fields, dates and quantity limits.';
  return error.message || 'The operation failed. Check your connection and try again.';
}
