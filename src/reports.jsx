import { useCallback, useState } from 'react';
import { rpc, useResource } from './api.js';
import { downloadExcel, downloadPdf } from './exports.js';
import { dateLabel, number } from './model.js';
import { DataTable, Empty, ErrorNotice, Field, Panel } from './ui.jsx';

const modes = [['lot','By lot'],['date','By cutting date'],['colour','By colour'],['size','By size'],['total','Total production']];

export function Reports({ signal, lot, settings }) {
  const [filters, setFilters] = useState({ group_by:'lot', start_on:'', end_on:'', lot_filter:lot || '', colour_filter:'' });
  const [applied, setApplied] = useState(filters);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const load = useCallback(() => rpc('production_report', { ...applied, start_on:applied.start_on || null, end_on:applied.end_on || null }), [applied]);
  const { data, error, loading, refresh } = useResource(load,JSON.stringify(applied),signal);
  const mode = modes.find(([id]) => id === applied.group_by)[1];
  const context = [mode, applied.start_on ? `From ${dateLabel(applied.start_on)}` : 'All start dates',
    applied.end_on ? `Through ${dateLabel(applied.end_on)}` : 'No end date',applied.lot_filter && `Lot ${applied.lot_filter.trim().toUpperCase()}`,
    applied.colour_filter && `Colour ${applied.colour_filter.trim()}`].filter(Boolean).join(' · ');

  async function exportReport(download) {
    setExporting(true);
    setExportError(null);
    try { await download(data,`${settings.business_name} | Cutting production`,context); }
    catch (failure) { setExportError(failure); }
    finally { setExporting(false); }
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">GARMENT PRODUCTION</p><h1>Production reports</h1><p>Based on cutting entry dates and saved size quantities.</p></div></div>
    <Panel title="Report filters" className="no-print"><form className="filters" onSubmit={event => { event.preventDefault(); setApplied({ ...filters }); }}>
      <div className="form-grid">{[
        ['group_by','Group by',{ options:modes }],['start_on','Cut date from',{ type:'date', max:filters.end_on || undefined }],
        ['end_on','Cut date to',{ type:'date', min:filters.start_on || undefined }],['lot_filter','Lot number (exact)',{ maxLength:60 }],
        ['colour_filter','Colour (exact)',{ maxLength:100 }],
      ].map(([key,label,props]) => <Field key={key} label={label} {...props} value={filters[key]} change={value => setFilters(current => ({ ...current,[key]:value }))} />)}</div>
      <button className="button primary">Run report</button>
    </form></Panel>
    <Panel title={mode} secondary={context} actions={<>
      <button className="button small" disabled={!data || loading || !!error || exporting} onClick={() => exportReport(downloadPdf)}>Download PDF</button>
      <button className="button small" disabled={!data || loading || !!error || exporting} onClick={() => exportReport(downloadExcel)}>Download Excel</button>
      <button className="button small" disabled={!data || loading || !!error} onClick={() => window.print()}>Print</button>
    </>}>
      <ErrorNotice error={error} retry={refresh} /><ErrorNotice error={exportError} />
      {!data && loading && <Empty>Loading report…</Empty>}
      {data && <>
        <div className="print-only"><strong>{settings.business_name}</strong></div>
        {!data.rows.length && <Empty>No pieces match these filters.</Empty>}
        <DataTable label="Production report" headings={['Group','Cutting entries','Main pieces','Balance pieces','Total pieces']} className="numeric">
          <tbody>{data.rows.map(row => <tr key={row.label}><th scope="row">{applied.group_by === 'date' ? dateLabel(row.label) : row.label}</th>
            <td>{number(row.entries)}</td><td>{number(row.main)}</td><td>{number(row.balance)}</td><td>{number(row.total)}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row">Grand total</th><td>{number(data.entries)}</td><td>{number(data.main)}</td><td>{number(data.balance)}</td><td>{number(data.total)}</td></tr></tfoot>
        </DataTable>
      </>}
    </Panel>
  </>;
}
