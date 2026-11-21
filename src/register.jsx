import { useCallback, useEffect, useState } from 'react';
import { checked, client, rpc, useResource } from './api.js';
import { LotEditor } from './editor.jsx';
import { dateLabel, fieldLabel, fieldVisible, money, number, reconcile, sizeTotals, timeLabel, visibleFacts } from './model.js';
import { DataTable, Empty, ErrorNotice, Facts, Field, Panel } from './ui.jsx';

const lotHref = lot => `#/lots/${encodeURIComponent(lot)}/record`;
const statusLabel = lot => lot.archived ? 'Archived' : lot.status === 'complete' ? 'Complete' : 'Open';

function LotList({ rows, settings }) {
  if (!rows.length) return <Empty>No lots match this view.</Empty>;
  return <div className="lot-list">{rows.map(lot => <a href={lotHref(lot.lot_no)} key={lot.lot_no} className="lot-row">
    <div><strong>Lot {lot.lot_no}</strong><span>{dateLabel(lot.cutting_date)}{fieldVisible(settings,'lot','style_no') && lot.style_no && ` · ${fieldLabel(settings,'lot','style_no','Style')} ${lot.style_no}`}{fieldVisible(settings,'lot','order_no') && lot.order_no && ` · ${fieldLabel(settings,'lot','order_no','Order')} ${lot.order_no}`}</span></div>
    <div><strong>{number(lot.pieces)} pcs</strong><span className={`badge ${statusLabel(lot).toLowerCase()}`}>{statusLabel(lot)}</span></div>
  </a>)}</div>;
}

export function Dashboard({ signal, canWrite, settings }) {
  const load = useCallback(() => rpc('book_dashboard'), []);
  const { data, loading, error, refresh } = useResource(load,'dashboard',signal);
  return <>
    <div className="page-heading"><div><p className="eyebrow">GARMENT PRODUCTION</p><h1>Production overview</h1><p>Follow cutting progress across the lot register.</p></div>
      {canWrite && <a className="button primary" href="#/new">Create lot</a>}</div>
    <ErrorNotice error={error} retry={refresh} />
    {!data && loading && <Empty>Loading production…</Empty>}
    {data && <>
      <div className="metrics">{[['Pieces today',data.today],['Total pieces',data.pieces],['Active lots',data.lots],['Cutting entries',data.entries],['Open lots',data.pending]].map(([label,value], index) =>
        <div className={`metric ${index === 0 ? 'featured' : ''}`} key={label}><span>{label}</span><strong>{number(value)}</strong></div>)}</div>
      <div className="dashboard-grid">
        <Panel title="Recently updated lots" actions={<a className="button small" href="#/lots">All lots</a>}><LotList rows={data.recent.slice(0,8)} settings={settings} /></Panel>
        <Panel title="Quick actions" className="quick"><div className="quick-links">
          {canWrite && <a className="button" href="#/new">Create new lot</a>}
          <a className="button" href="#/lots">Search the register</a>
          <a className="button" href="#/lots/open">Review open lots</a>
          <a className="button" href="#/reports">Production reports</a>
        </div></Panel>
      </div>
    </>}
  </>;
}

const emptySearch = { term:'', start_on:'', end_on:'', style:'', colour:'', state:'' };

export function Register({ signal, canWrite, isAdmin, view, settings }) {
  const initial = { ...emptySearch, state:view };
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(0);
  const load = useCallback(() => rpc('lot_search', { ...filters, start_on:filters.start_on || null, end_on:filters.end_on || null, page_number:page }), [filters,page]);
  const { data, loading, error, refresh } = useResource(load,JSON.stringify([filters,page]),signal);
  return <>
    <div className="page-heading"><div><p className="eyebrow">CUTTING REGISTER</p><h1>{view === 'archived' ? 'Archived lots' : 'Lots'}</h1></div>
      <div className="actions">{isAdmin && <a className="button" href={view === 'archived' ? '#/lots' : '#/lots/archived'}>{view === 'archived' ? 'Active lots' : 'Archived'}</a>}
        {canWrite && view !== 'archived' && <a className="button primary" href="#/new">Create lot</a>}</div></div>
    <Panel title="Find a lot" className="no-print">
      <form className="filters" onSubmit={event => { event.preventDefault(); setPage(0); setFilters({ ...draft }); }}>
        <div className="form-grid">
          {[
            ['term','Search lot records',{ type:'search', placeholder:'Lot number, date or reference' }],
            ['start_on','Lot date from',{ type:'date', max:draft.end_on || undefined }], ['end_on','Lot date to',{ type:'date', min:draft.start_on || undefined }],
            ...(fieldVisible(settings,'lot','style_no') ? [['style',fieldLabel(settings,'lot','style_no','Style')]] : []),
            ['colour',fieldLabel(settings,'colour','name','Colour')], ['state',fieldLabel(settings,'lot','status','Status'),{ options:[['','All active'],['open','Open'],['complete','Complete'],...(isAdmin ? [['archived','Archived']] : [])] }],
          ].map(([key,label,props]) => <Field key={key} {...props} label={label} value={draft[key]} change={value => setDraft(current => ({ ...current,[key]:value }))} />)}
        </div>
        <div className="actions"><button className="button primary">Search lots</button><button type="button" className="button" onClick={() => { setDraft(initial); setFilters(initial); setPage(0); }}>Clear filters</button></div>
      </form>
    </Panel>
    <Panel title={data ? `${number(data.count)} ${data.count === 1 ? 'lot' : 'lots'}` : 'Search results'}>
      <ErrorNotice error={error} retry={refresh} />
      {!data && loading && <Empty>Loading lots…</Empty>}
      {data && <><LotList rows={data.rows} settings={settings} />{(page > 0 || data.count > 25) && <div className="pagination">
        <button type="button" className="button small" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page + 1} of {Math.max(1,Math.ceil(data.count / 25))}</span>
        <button type="button" className="button small" disabled={(page + 1) * 25 >= data.count || loading} onClick={() => setPage(page + 1)}>Next</button>
      </div>}</>}
    </Panel>
  </>;
}

function customFacts(settings, scope, row) {
  return settings.field_definitions.filter(field => field.scope === scope && field.active && row.extra?.[field.id]).map(field => [field.label,row.extra[field.id]]);
}

function Controls({ entity, row, open, canWrite, isAdmin }) {
  if (!canWrite) return null;
  return <div className="actions no-print">
    <button type="button" className="button small" onClick={() => open({ entity,row })}>Edit<span className="sr-only"> {entity} {row.name || row.batch_no || row.reference || row.work_type || ''}</span></button>
    {isAdmin && <button type="button" className="button small delete" onClick={() => open({ entity,row,operation:'delete' })}>Delete</button>}
  </div>;
}

function Fabric({ record, settings, permissions }) {
  return <Panel title="Lot & fabric inward" secondary="Batch and colour records" actions={permissions.canWrite && <>
    <button type="button" className="button small" onClick={() => permissions.open({ entity:'colour' })}>Add colour</button>
            <button type="button" className="button small secondary" disabled={!record.colours.length} onClick={() => permissions.open({ entity:'batch' })}>Add fabric batch</button>
  </>}>
    {!record.colours.length && <Empty>Add a colour before recording its fabric batches.</Empty>}
    {record.colours.map(colour => {
      const batches = record.batches.filter(batch => batch.colour_id === colour.id);
      return <div className="record-group" key={colour.id}>
        <div className="section-line"><h3>{colour.name}</h3><Controls entity="colour" row={colour} {...permissions} /></div>
        {!batches.length && <p className="muted">No fabric batches yet.</p>}
        {batches.map(batch => <div className="subrecord" key={batch.id}>
          <div className="section-line"><h4>Batch {batch.batch_no}</h4><Controls entity="batch" row={batch} {...permissions} /></div>
          <Facts rows={[
            ...visibleFacts(settings,'batch',[
              ['metres','Inward',`${number(batch.metres)} m`],['barcode','Barcode',batch.barcode],['roll_count','Rolls',batch.roll_count],['supplier','Mill / supplier',batch.supplier],
              ['bill_no','Challan / bill',batch.bill_no],['received_on','Inward date',batch.received_on && dateLabel(batch.received_on)],['fabric','Fabric quality',batch.fabric],
              ['width_inches','Width',batch.width_inches != null ? `${number(batch.width_inches)} in` : null],
              ['shrink_length','Length shrinkage',batch.shrink_length != null ? `${number(batch.shrink_length)}%` : null],
              ['shrink_width','Width shrinkage',batch.shrink_width != null ? `${number(batch.shrink_width)}%` : null],
              ['remarks','Remarks',batch.remarks],
            ]), ...customFacts(settings,'batch',batch),
          ]} />
        </div>)}
      </div>;
    })}
  </Panel>;
}

function Cutting({ record, settings, permissions }) {
  const totals = sizeTotals(record.cuts);
  const sizes = settings.sizes.filter(size => size.active || totals.has(size.id));
  const labelFor = (key,label) => fieldLabel(settings,'cut',key,label);
  const showReference = fieldVisible(settings,'cut','reference');
  const showRoll = fieldVisible(settings,'cut','roll_metres');
  const referenceLabel = showReference ? `${fieldLabel(settings,'colour','name','Colour')} / ${labelFor('reference','reference')}` : fieldLabel(settings,'colour','name','Colour');
  const columns = [['roll_metres','Roll m'],['marker_metres','Marker m'],['layers','Layers']].filter(([key]) => fieldVisible(settings,'cut',key));
  const leadingColumns = [referenceLabel,labelFor('batch_id','Batch'),labelFor('cut_on','Cut date'),...columns.map(([key,label]) => labelFor(key,label)),'Ratio'];
  const heading = [...leadingColumns,...sizes.map(size => size.label),labelFor('pieces','Main pcs'),labelFor('balance_pieces','Balance pcs'),'Total pcs'];
  return <Panel title="Size ratio & cutting summary" secondary="Size columns include main and balance pieces" actions={permissions.canWrite &&
    <button type="button" className="button small secondary" disabled={!record.batches.length} onClick={() => permissions.open({ entity:'cut' })}>Add cutting entry</button>}>
    {!record.cuts.length ? <Empty>{record.batches.length ? 'No cutting entries yet.' : 'Add a fabric batch before recording a cut.'}</Empty> : <>
      <div className={sizes.length > 8 ? 'no-print' : ''}><DataTable label="Size-wise cutting register" headings={heading} className="register-table numeric">
        <tbody>{record.colours.map(colour => {
          const batches = record.batches.filter(batch => batch.colour_id === colour.id);
          const cuts = record.cuts.filter(cut => batches.some(batch => batch.id === cut.batch_id));
          if (!cuts.length) return null;
          const summary = reconcile(batches,cuts);
          const colourSizes = sizeTotals(cuts);
          return <ColourCutRows key={colour.id} {...{ colour,batches,cuts,summary,colourSizes,sizes,permissions,showReference,columns }} />;
        })}</tbody>
        <tfoot><tr><th scope="row" colSpan={leadingColumns.length}>Lot total</th>{sizes.map(size => <td key={size.id}>{number(totals.get(size.id))}</td>)}
          {(() => { const total = reconcile(record.batches,record.cuts); return <><td>{number(total.mainPieces)}</td><td>{number(total.balancePieces)}</td><td>{number(total.pieces)}</td></>; })()}</tr></tfoot>
      </DataTable></div>
      {sizes.length > 8 && <div className="print-only">{record.cuts.map(cut => {
        const batch = record.batches.find(row => row.id === cut.batch_id);
        const colour = record.colours.find(row => row.id === batch?.colour_id);
        const labels = new Map(sizes.map(size => [size.id,size.label]));
        return <div key={cut.id} className="subrecord"><h4>{colour?.name} · {batch?.batch_no} · {showReference && cut.reference || 'Cut'} · {dateLabel(cut.cut_on)}</h4>
          <Facts rows={[
            ...columns.map(([key,label]) => [labelFor(key,label),cut[key]]),
            ...cut.quantities.map(row => [labels.get(row.size_id),`${number(row.pieces)} ${labelFor('pieces','main')} + ${number(row.balance_pieces)} ${labelFor('balance_pieces','balance')}${cut.method === 'ratio' ? ` · ratio ${row.ratio}` : ''}`]),
          ]} /></div>;
      })}</div>}
      <DataTable label="Fabric use by cutting entry" headings={[...leadingColumns.slice(0,3),labelFor('main_used','Main used m'),labelFor('balance_used','Balance used m'),labelFor('waste_metres','Waste m'),...(showRoll ? ['Roll remaining m'] : [])]} className="numeric">
        <tbody>{record.cuts.map(cut => {
          const batch = record.batches.find(row => row.id === cut.batch_id);
          const colour = record.colours.find(row => row.id === batch?.colour_id);
          const roll = cut.roll_metres == null ? null : reconcile([{ metres:cut.roll_metres }],[cut]);
          return <tr key={cut.id}><th scope="row">{colour?.name}{showReference && cut.reference && ` · ${cut.reference}`}</th>
            <td>{batch?.batch_no}</td><td>{dateLabel(cut.cut_on)}</td><td>{number(cut.main_used)}</td><td>{number(cut.balance_used)}</td>
            <td>{number(cut.waste_metres)}</td>{showRoll && <td className={roll?.remaining < 0 ? 'negative' : ''}>{roll ? number(roll.remaining) : '—'}</td>}</tr>;
        })}</tbody>
      </DataTable>
      {record.cuts.map(cut => {
        const notes = [...visibleFacts(settings,'cut',[['remarks','Remarks',cut.remarks]]), ...customFacts(settings,'cut',cut)].filter(([,value]) => value);
        return notes.length > 0 && <div key={cut.id} className="subrecord"><h4>{showReference && cut.reference || 'Cut'} · {dateLabel(cut.cut_on)}</h4><Facts rows={notes} /></div>;
      })}
    </>}
  </Panel>;
}

function ColourCutRows({ colour,batches,cuts,summary,colourSizes,sizes,permissions,showReference,columns }) {
  return <>
    {cuts.map(cut => {
      const numbers = reconcile([], [cut]);
      const bySize = new Map(cut.quantities.map(quantity => [quantity.size_id,quantity]));
      return <tr key={cut.id}><th scope="row">{colour.name}{showReference && cut.reference && ` · ${cut.reference}`}<Controls entity="cut" row={cut} {...permissions} /></th>
        <td>{batches.find(batch => batch.id === cut.batch_id)?.batch_no}</td><td>{dateLabel(cut.cut_on)}</td>
        {columns.map(([key]) => <td key={key}>{cut[key] == null ? '—' : number(cut[key])}</td>)}
        <td>{cut.method === 'ratio' ? number(cut.quantities.reduce((sum,quantity) => sum + quantity.ratio,0)) : '—'}</td>
        {sizes.map(size => {
          const quantity = bySize.get(size.id);
          return <td key={size.id}>{number(Number(quantity?.pieces || 0) + Number(quantity?.balance_pieces || 0))}
            {cut.method === 'ratio' && quantity?.ratio > 0 && <small className="cell-note">ratio {quantity.ratio}</small>}
            {quantity?.balance_pieces > 0 && <small className="cell-note">{number(quantity.balance_pieces)} bal.</small>}</td>;
        })}
        <td>{number(numbers.mainPieces)}</td><td>{number(numbers.balancePieces)}</td><td><strong>{number(numbers.pieces)}</strong></td>
      </tr>;
    })}
    <tr className="subtotal"><th scope="row" colSpan={4 + columns.length}>{colour.name} total</th>{sizes.map(size => <td key={size.id}>{number(colourSizes.get(size.id))}</td>)}
      <td>{number(summary.mainPieces)}</td><td>{number(summary.balancePieces)}</td><td>{number(summary.pieces)}</td></tr>
  </>;
}

function Reconciliation({ record, summary }) {
  const metrics = (label, charts, key = label) => <tr key={key}><th scope="row">{label}</th><td>{number(charts.inward)}</td><td>{number(charts.main)}</td>
    <td>{number(charts.balance)}</td><td>{number(charts.used)}</td><td>{number(charts.waste)}</td>
    <td className={charts.remaining < 0 ? 'negative' : ''}>{number(charts.remaining)}</td><td>{charts.average == null ? '—' : number(charts.average)}</td></tr>;
  return <Panel title="Fabric reconciliation" secondary="Remaining = inward − main used − balance used − wastage">
    <DataTable label="Fabric reconciliation by batch" headings={['Batch', 'Inward m','Main used m','Balance used m','Total used m','Waste m','Remaining m','Used m / piece']} className="numeric">
      <tbody>{record.batches.map(batch => {
        const colour = record.colours.find(item => item.id === batch.colour_id);
        return metrics(`${batch.batch_no} · ${colour?.name || ''}`, reconcile([batch],record.cuts.filter(cut => cut.batch_id === batch.id)), batch.id);
      })}</tbody>
      <tfoot>{metrics('Lot total',summary)}</tfoot>
    </DataTable>
  </Panel>;
}

function Jobwork({ record, settings, permissions }) {
  const labelFor = (key,label) => fieldLabel(settings,'jobwork',key,label);
  const showBundle = fieldVisible(settings,'jobwork','bundle');
  const showSign = fieldVisible(settings,'jobwork','signed_by');
  return <Panel title="Karigar issue & receive" secondary="Jobwork for this lot" actions={permissions.canWrite &&
    <button type="button" className="button small secondary" onClick={() => permissions.open({ entity:'jobwork' })}>Add jobwork</button>}>
    {!record.jobwork.length ? <Empty>No jobwork recorded.</Empty> : <>
      <DataTable label="Jobwork issue and receive" headings={[labelFor('work_type','Work type'),labelFor('issued_on','Issued on'),labelFor('worker','Karigar'),
        ...(showBundle ? [labelFor('bundle','Bundle / size')] : []),labelFor('issued','Issued'),labelFor('received_on','Received on'),labelFor('received','Good pcs'),
        labelFor('damaged','Damage'),'Pending',labelFor('rate','Rate'),'Amount',...(showSign ? [labelFor('signed_by','Sign')] : [])]} className="register-table numeric">
        <tbody>{record.jobwork.map(row => <tr key={row.id}>
          <th scope="row">{row.work_type}<Controls entity="jobwork" row={row} {...permissions} /></th><td>{dateLabel(row.issued_on)}</td><td>{row.worker}</td>{showBundle && <td>{row.bundle || '—'}</td>}
          <td>{number(row.issued)}</td><td>{dateLabel(row.received_on)}</td><td>{number(row.received)}</td><td>{number(row.damaged)}</td>
          <td>{number(row.issued - row.received - row.damaged)}</td><td>{money(row.rate)}</td><td>{money(row.rate * row.issued)}</td>{showSign && <td>{row.signed_by || '—'}</td>}
        </tr>)}</tbody>
        <tfoot><tr><th scope="row" colSpan={showBundle ? 4 : 3}>Total</th><td>{number(record.jobwork.reduce((total,row) => total + row.issued,0))}</td><td />
          <td>{number(record.jobwork.reduce((total,row) => total + row.received,0))}</td><td>{number(record.jobwork.reduce((total,row) => total + row.damaged,0))}</td>
          <td>{number(record.jobwork.reduce((total,row) => total + row.issued - row.received - row.damaged,0))}</td><td />
          <td>{money(record.jobwork.reduce((total,row) => total + Math.round(Number(row.rate) * 100) * row.issued,0) / 100)}</td>{showSign && <td />}</tr></tfoot>
      </DataTable>
      {record.jobwork.map(row => {
        const notes = [...visibleFacts(settings,'jobwork',[['remarks','Remarks',row.remarks]]), ...customFacts(settings,'jobwork',row)].filter(([,value]) => value);
        return notes.length > 0 && <div className="subrecord" key={row.id}><h4>{row.work_type} · {row.worker}</h4><Facts rows={notes} /></div>;
      })}
    </>}
  </Panel>;
}

const auditNames = { lots:'Lot', fabric_colours:'Colour', fabric_batches:'Fabric batch', cuts:'Cut', cut_quantities:'Size quantity', jobwork:'Jobwork', book_settings:'Register settings', sizes:'Size', members:'Membership' };

export function Audit({ lot, signal }) {
  const [cursor, setCursor] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const load = useCallback(() => {
    let request = client.from('audit_history').select('*').order('id',{ ascending:false }).limit(26);
    if (lot) request = request.eq('lot_no',lot);
    if (cursor) request = request.lt('id',cursor);
    return expanded ? checked(request) : Promise.resolve([]);
  }, [lot,cursor,expanded]);
  const { data, loading, error, refresh } = useResource(load,JSON.stringify([lot,cursor,expanded]),signal);
  return <Panel title={lot ? 'Cutting & audit history' : 'Audit history'} className="no-print" actions={
    <button className="button small" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide history' : 'Show history'}</button>
  }>{expanded && <>
    <ErrorNotice error={error} retry={refresh} />
    {loading && !data && <Empty>Loading history…</Empty>}
    {data?.length === 0 && <Empty>No changes recorded on this page.</Empty>}
    {data?.slice(0,25).map(change => <details className="audit-row" key={change.id}><summary>
      <strong>{auditNames[change.entity] || change.entity} {change.action === 'INSERT' ? 'created' : change.action === 'DELETE' ? 'deleted' : 'updated'}</strong>
      <span>{change.lot_no && !lot && `Lot ${change.lot_no} · `}{change.actor_name} · {timeLabel(change.changed_at)}</span>
    </summary><div className="audit-values">{[['Before',change.before_data],['After',change.after_data]].map(([label,value]) =>
      value && <div key={label}><h4>{label}</h4><pre>{JSON.stringify(value,null,2)}</pre></div>)}</div></details>)}
    {(cursor || data?.length > 25) && <div className="pagination">
      <button className="button small" type="button" disabled={!cursor || loading} onClick={() => setCursor(null)}>Newest</button>
      <button className="button small" type="button" disabled={!(data?.length > 25) || loading} onClick={() => setCursor(data[24].id)}>Older</button>
    </div>}
  </>}</Panel>;
}

export function LotPage({ lotNo, signal, role, settings, onSaved }) {
  const load = useCallback(() => rpc('lot_record',{ lot:lotNo }), [lotNo]);
  const { data:record, loading, error, refresh } = useResource(load,lotNo,signal);
  const [editor, setEditor] = useState(null);
  const lot = record?.lot;
  const open = change => setEditor({ change, revision:lot.revision, record });
  const isAdmin = role === 'admin';
  const canWrite = role !== 'viewer' && !lot?.archived;
  const permissions = { canWrite,isAdmin,open };
  useEffect(() => { window.scrollTo(0,0); }, [lotNo]);
  const activeEditor = editor && <LotEditor editor={editor.change} record={editor.record} currentRevision={lot?.revision ?? -1}
    settings={settings} baseRevision={editor.revision} close={() => setEditor(null)} saved={(key,message) => { setEditor(null); onSaved(message); }} />;
  if (!lot) return <><a className="button no-print" href="#/lots">All lots</a><ErrorNotice error={error} retry={refresh} />
    <Empty>{loading ? 'Loading lot…' : error ? 'The lot could not be refreshed.' : 'Lot unavailable.'}</Empty>{activeEditor}</>;
  const summary = reconcile(record.batches,record.cuts);
  return <>
    <div className="print-only"><strong>{settings.business_name}</strong><p>LOT CUTTING & JOBWORK REGISTER</p></div>
    <div className="page-heading"><div><a className="eyebrow no-print" href="#/lots">LOT REGISTER</a><h1>Lot {lot.lot_no}</h1>
      <p>{dateLabel(lot.cutting_date)}{fieldVisible(settings,'lot','style_no') && lot.style_no && ` · ${fieldLabel(settings,'lot','style_no','Style')} ${lot.style_no}`} <span className={`badge ${statusLabel(lot).toLowerCase()}`}>{statusLabel(lot)}</span></p></div>
      <div className="actions no-print"><button type="button" className="button" onClick={() => window.print()}>Print lot</button>
        <a className="button" href={`#/reports/${encodeURIComponent(lot.lot_no)}`}>Lot report</a>
        {canWrite && <button type="button" className="button primary" onClick={() => open({ entity:'lot',row:lot })}>Edit lot</button>}
        {isAdmin && <button className={`button ${lot.archived ? '' : 'delete'}`} type="button" onClick={() => open({ entity:'lot',row:lot,operation:lot.archived ? 'restore' : 'delete' })}>
          {lot.archived ? 'Restore lot' : 'Delete lot'}</button>}</div></div>
    <ErrorNotice error={error} retry={refresh} />
    <div className="metrics lot-metrics">{[['Total pieces',number(summary.pieces)],['Fabric inward',`${number(summary.inward)} m`],['Fabric remaining',`${number(summary.remaining)} m`],['Cutting entries',number(record.cuts.length)]].map(([label,value],index) =>
      <div key={label} className={`metric ${index === 0 ? 'featured' : ''}`}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <Panel title="Lot details"><Facts rows={[
      ...visibleFacts(settings,'lot',[
        ['register_no','Register no.',lot.register_no],['order_no','Order / soft no.',lot.order_no],['style_no','Style',lot.style_no],
        ['fit','Fit',lot.fit],['item','Item',lot.item],['party','Party',lot.party],['sort_no','Sort no.',lot.sort_no],['cutting_master','Cutting master',lot.cutting_master],
      ]),['Updated',timeLabel(lot.updated_at)],...customFacts(settings,'lot',lot),
    ]} /></Panel>
    <Fabric {...{ record,settings,permissions }} /><Cutting {...{ record,settings,permissions }} />
    <Reconciliation record={record} summary={summary} />
    <Jobwork {...{ record,settings,permissions }} />
    {fieldVisible(settings,'lot','remarks') && <Panel title={fieldLabel(settings,'lot','remarks','Accessories & remarks')}><p className="remarks">{lot.remarks || '—'}</p></Panel>}
    <div className="signatures print-only"><span>Cutting master</span><span>Supervisor</span><span>Authorized sign</span></div>
    <Audit lot={lotNo} signal={signal} />
    {activeEditor}
  </>;
}
