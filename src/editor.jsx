import { useState } from 'react';
import { rpc } from './api.js';
import { number, quantitiesForSave, roundMetres, today } from './model.js';
import { DataTable, Dialog, ErrorNotice, Field } from './ui.jsx';

export const entityName = { lot: 'Lot', colour: 'Colour', batch: 'Fabric batch', cut: 'Cutting entry', jobwork: 'Jobwork entry' };

const lotFields = [
  ['lot_no','Lot number',{ required:true, maxLength:60 }], ['cutting_date','Cutting date',{ type:'date', required:true }],
  ['order_no','Order / soft number'], ['style_no','Style / design number'], ['fit','Fit type'], ['item','Item'],
  ['party','Party / supplier'], ['sort_no','Sort number'], ['register_no','Register number'], ['cutting_master','Cutting master'],
  ['remarks','Accessories / remarks',{ type:'textarea' }],
];
const decimal = { type:'number', inputMode:'decimal', step:'0.001', min:0, max:100000000 };
const integer = { type:'number', inputMode:'numeric', step:1, min:0, max:100000000 };
const percent = { ...decimal, step:'0.01', max:100 };
const batchFields = [
  ['batch_no','Fabric batch number',{ required:true, maxLength:120 }], ['barcode','Barcode'], ['supplier','Mill / fabric supplier'],
  ['bill_no','Challan / bill number'], ['fabric','Fabric quality / details'], ['received_on','Inward date',{ type:'date' }],
  ['width_inches','Width (in)',{ ...decimal, step:'0.01', max:9999 }], ['roll_count','Roll count',{ ...integer, max:1000000 }],
  ['shrink_length','Length shrinkage (%)',percent], ['shrink_width','Width shrinkage (%)',percent],
  ['metres','Inward metres',{ ...decimal, required:true }], ['remarks','Batch remarks',{ type:'textarea' }],
];
const cutFields = [
  ['cut_on','Cut date',{ type:'date', required:true }], ['reference','Roll / cutting reference'],
  ['roll_metres','Roll metres',decimal], ['marker_metres','Marker metres',decimal],
  ['layers','Layers',{ ...integer, max:100000 }], ['main_used','Main fabric used (m)',{ ...decimal, required:true }],
  ['balance_used','Balance fabric used (m)',{ ...decimal, required:true }], ['waste_metres','Wastage (m)',{ ...decimal, required:true }],
  ['remarks','Cutting remarks / details',{ type:'textarea' }],
];
const jobFields = [
  ['issued_on','Issue date',{ type:'date', required:true }], ['work_type','Work type',{ required:true, maxLength:120 }],
  ['worker','Karigar name',{ required:true, maxLength:120 }], ['bundle','Bundle / size'],
  ['issued','Issued pieces',{ ...integer, min:1, required:true }], ['received_on','Received date',{ type:'date' }],
  ['received','Received good pieces',{ ...integer, required:true }], ['damaged','Damaged pieces',{ ...integer, required:true }],
  ['rate','Rate per issued piece (₹)',{ ...decimal, step:'0.01', required:true }], ['signed_by','Signed by'],
  ['remarks','Jobwork remarks',{ type:'textarea' }],
];

function initialDraft(entity, row, record) {
  if (row) return { ...row, quantities: Object.fromEntries((row.quantities || []).map(quantity => [quantity.size_id,quantity])) };
  const defaults = {
    lot: { cutting_date:today(), status:'open' }, colour: { name:'' }, batch: {},
    cut: { cut_on:record?.lot.cutting_date || today(), method:'actual', main_used:0, balance_used:0, waste_metres:0, quantities:{} },
    jobwork: { issued_on:today(), received:0, damaged:0, rate:0 },
  };
  return { ...defaults[entity], extra:{} };
}

export function LotEditor({ editor, record, settings, baseRevision, currentRevision, close, saved }) {
  const { entity, row, operation = row ? 'update' : 'create' } = editor;
  const [draft, setDraft] = useState(() => initialDraft(entity, row, record));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(false);
  const action = { create:'Add', update:'Edit', delete: entity === 'lot' ? 'Archive' : 'Delete', restore:'Restore' }[operation];
  const confirmOnly = operation === 'delete' || operation === 'restore';
  const stale = conflict || (baseRevision != null && currentRevision !== baseRevision);
  const sizes = settings.sizes.filter(size => size.active || draft.quantities?.[size.id]);
  const fields = { lot:lotFields, batch:batchFields, cut:cutFields, jobwork:jobFields, colour:[['name','Colour name',{ required:true, maxLength:100 }]] }[entity];
  const quantities = entity === 'cut' ? quantitiesForSave(draft,sizes) : [];
  const total = quantities.reduce((sum,quantity) => sum + quantity.pieces + quantity.balance_pieces,0);
  const setValue = (key, value) => setDraft(current => ({ ...current, [key]:value }));
  const setQuantity = (id, key, value) => setDraft(current => ({ ...current, quantities: {
    ...current.quantities, [id]:{ ...current.quantities?.[id], [key]:value },
  } }));

  async function submit(event) {
    event.preventDefault();
    if (busy || stale) return;
    setBusy(true);
    setError(null);
    const lot = record?.lot.lot_no || draft.lot_no?.trim().toUpperCase();
    let payload = { id:row?.id };
    try {
      if (!confirmOnly) {
        for (const [name,label,attributes] of fields) {
          if (name === 'lot_no') continue;
          const value = draft[name];
          if (attributes?.required && String(value ?? '').trim() === '') throw new Error(`${label} is required.`);
          payload[name] = ['number','date'].includes(attributes?.type) && (value == null || value === '') ? null : value ?? '';
        }
        if (entity === 'lot' && row) payload.status = draft.status;
        if (entity === 'batch') payload.colour_id = draft.colour_id;
        if (entity === 'cut') Object.assign(payload, { batch_id:draft.batch_id, method:draft.method, quantities });
        if (entity === 'jobwork' && Number(draft.received) + Number(draft.damaged) > Number(draft.issued)) {
          throw new Error('Received plus damaged pieces cannot exceed the number issued.');
        }
        payload.extra = draft.extra;
      }
      if (!lot) throw new Error('Lot number is required.');
      await rpc('change_lot', { lot, expected:baseRevision ?? null, entity, operation, payload });
      saved(lot, `${entityName[entity]} ${confirmOnly ? operation === 'restore' ? 'restored' : entity === 'lot' ? 'archived' : 'deleted' : 'saved'}.`);
    } catch (failure) {
      if (failure.code === '40001') setConflict(true);
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return <Dialog title={`${action} ${entityName[entity].toLowerCase()}`} close={close} busy={busy}>
    <form onSubmit={submit}>
      <div className="dialog-body">
        {stale && <p className="notice error" role="alert">This lot changed on another device. Your draft is still visible. Review or copy your values, then close and reopen the form using the latest record.</p>}
        <ErrorNotice error={error} />
        {confirmOnly ? <p>{entity === 'lot' ? operation === 'restore' ? 'Restore this lot to the active register and production reports?' : 'Archive this lot and exclude it from active registers and reports? Its records and history will be retained.' : 'Remove this record from the lot? This change will be kept in the audit history.'}</p> : <fieldset disabled={busy}>
          <div className="form-grid">
            {entity === 'batch' && <Field label="Colour" required value={draft.colour_id} change={value => setValue('colour_id',value)} options={[
              ['', 'Select colour'], ...record.colours.map(colour => [colour.id,colour.name]),
            ]} />}
            {entity === 'cut' && <>
              <Field label="Fabric batch" required value={draft.batch_id} change={value => setValue('batch_id',value)} options={[
                ['', 'Select batch'], ...record.batches.map(batch => [batch.id,`${batch.batch_no} · ${record.colours.find(colour => colour.id === batch.colour_id)?.name || ''}`]),
              ]} />
              <Field label="Entry method" value={draft.method} change={value => setValue('method',value)} options={[
                ['actual','Enter actual quantities'], ['ratio','Calculate main pieces from ratio and layers'],
              ]} />
            </>}
            {fields.map(([key,label,attributes]) => <Field key={key} label={label} maxLength={key === 'remarks' ? 4000 : 250}
              {...attributes} {...(key === 'layers' && draft.method === 'ratio' ? { required:true, min:1 } : {})}
              value={draft[key]} change={value => setValue(key,value)} readOnly={key === 'lot_no' && !!row} />)}
            {entity === 'lot' && row && <Field label="Status" value={draft.status} change={value => setValue('status',value)}
              options={[[ 'open','Open' ],['complete','Complete']]} />}
            {settings.field_definitions.filter(field => field.scope === entity && (field.active || draft.extra?.[field.id] != null)).map(field =>
              <Field key={field.id} label={field.label} readOnly={!field.active} maxLength={2000} value={draft.extra?.[field.id]}
                change={value => setDraft(current => ({ ...current, extra:{ ...current.extra, [field.id]:value } }))} />)}
          </div>
          {entity === 'cut' && <div className="quantity-entry">
            <div className="section-line"><h3>Size quantities</h3><strong>{number(total)} pieces</strong></div>
            {Number(draft.marker_metres) > 0 && Number(draft.layers) > 0 && <button type="button" className="button small" onClick={() =>
              setValue('main_used',roundMetres(Number(draft.marker_metres) * Number(draft.layers)))}>Use marker × layers for main metres</button>}
            <DataTable label="Enter size quantities" headings={['Size',draft.method === 'ratio' ? 'Ratio' : 'Main pieces','Balance pieces','Total']} className="quantity-inputs">
              <tbody>{sizes.map(size => {
                const quantity = quantities.find(item => item.size_id === size.id);
                const main = draft.method === 'ratio' ? 'ratio' : 'pieces';
                const entry = draft.quantities?.[size.id];
                return <tr key={size.id}><th scope="row">{size.label}{!size.active && ' (inactive)'}</th>
                  {[main,'balance_pieces'].map(key => <td key={key}><input aria-label={`${size.label} ${key.replace('_',' ')}`} {...integer}
                    max={key === 'ratio' ? 1000 : integer.max} value={entry?.[key] ?? ''} onChange={event => setQuantity(size.id,key,event.target.value)} /></td>)}
                  <td>{number((quantity?.pieces || 0) + (quantity?.balance_pieces || 0))}</td></tr>;
              })}</tbody>
            </DataTable>
          </div>}
        </fieldset>}
      </div>
      <div className="dialog-footer"><button type="button" className="button" onClick={close} disabled={busy}>Cancel</button>
        <button className={`button ${operation === 'delete' ? 'danger' : 'primary'}`} disabled={busy || stale}>
          {busy ? 'Saving…' : confirmOnly ? action : 'Save record'}
        </button></div>
    </form>
  </Dialog>;
}
