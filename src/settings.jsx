import { useCallback, useState } from 'react';
import { checked, client, rpc, useResource } from './api.js';
import { registerFields } from './editor.jsx';
import { Audit } from './register.jsx';
import { DataTable, Dialog, ErrorNotice, Field, Panel } from './ui.jsx';

const scopes = [['lot','Lot'],['batch','Fabric batch'],['cut','Cutting entry'],['jobwork','Jobwork']];
const booleanOptions = [['true','Active'],['false','Inactive']];
const blankMember = { user_id:'', display_name:'', role:'viewer', active:true };
const blankSize = { label:'', position:100, active:true };

function SettingsEditor({ editor, settings, close, saved }) {
  const { action, row, revision } = editor;
  const [draft, setDraft] = useState(row);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const stale = settings.revision !== revision || error?.code === '40001';
  const setValue = (key,value) => setDraft(current => ({ ...current,[key]:value }));
  const changeField = (id,key,value) => setDraft(current => ({ ...current,
    field_definitions:current.field_definitions.map(field => field.id === id ? { ...field,[key]:value } : field),
  }));

  async function submit(event) {
    event.preventDefault();
    if (stale || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (action === 'layout') {
        const labels = Object.fromEntries(Object.entries(draft.labels).filter(([,label]) => label.trim()).map(([key,label]) => [key,label.trim()]));
        await rpc('change_field_layout',{ expected:revision, hidden:draft.hidden, labels });
      } else await rpc('change_settings',{ expected:revision, action, payload:draft });
      saved('Settings saved.');
    } catch (failure) { setError(failure); }
    finally { setSaving(false); }
  }

  return <Dialog title={{ size:'Size settings', member:'Member access', book:'Custom fields', layout:'Rename or hide fields' }[action]} close={close} busy={saving}>
    <form onSubmit={submit}>
      <div className="dialog-body">
        {stale && <p className="notice error" role="alert">Settings changed on another device. Close this form and reopen it to apply your changes.</p>}
        <ErrorNotice error={error} />
        <fieldset disabled={saving}><div className="form-grid">
          {action === 'size' && <>
            <Field label="Size label" value={draft.label} change={value => setValue('label',value)} readOnly={!!draft.id} required maxLength={24} />
            <Field label="Column order" value={draft.position} change={value => setValue('position',value)} type="number" min="0" max="9999" step="1" required />
            {draft.id && <Field label="Status" value={String(draft.active)} change={value => setValue('active',value === 'true')} options={booleanOptions} />}
          </>}
          {action === 'member' && <>
            <Field label="Supabase user ID" value={draft.user_id} change={value => setValue('user_id',value.trim())} required
              readOnly={row !== blankMember} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" />
            <Field label="Display name" value={draft.display_name} change={value => setValue('display_name',value)} required maxLength={120} />
            <Field label="Role" value={draft.role} change={value => setValue('role',value)} options={[[ 'viewer','Viewer' ],['staff','Staff'],['admin','Admin']]} />
            <Field label="Status" value={String(draft.active)} change={value => setValue('active',value === 'true')} options={booleanOptions} />
          </>}
          {action === 'book' && <Field label="Business name" value={draft.business_name} change={value => setValue('business_name',value)} required maxLength={120} />}
        </div>
        {action === 'layout' && <div className="field-settings">
          <p className="muted">Leave a name blank to use the original label. Hiding a field keeps any saved values. Required fields stay visible.</p>
          {[scopes[0],['colour','Colour'],...scopes.slice(1)].map(([entity,section],index) =>
            <details className="subrecord layout-group" key={entity} open={index === 0 || undefined}>
              <summary><strong>{section}</strong></summary>
              <div className="form-grid layout-fields">{registerFields[entity].map(([key,label,canHide]) => {
                const code = `${entity}.${key}`;
                const hidden = draft.hidden.includes(code);
                return <div className="layout-field" key={code}>
                  <Field label={label} value={draft.labels[code] || ''} placeholder={label} maxLength={60}
                    change={value => setDraft(current => ({ ...current, labels:{ ...current.labels,[code]:value } }))} />
                  {canHide && <label className="checkbox-label"><input type="checkbox" checked={hidden} onChange={event => {
                    const hide = event.target.checked;
                    setDraft(current => ({ ...current, hidden:hide ? [...current.hidden,code] : current.hidden.filter(item => item !== code) }));
                  }} />Hide <span className="sr-only">{label}</span></label>}
                </div>;
              })}</div>
            </details>)}
        </div>}
        {action === 'book' && <div className="field-settings">
          <p className="muted">Deactivate unused custom fields to hide them and keep their saved values.</p>
          {draft.field_definitions.map(field => <div className="form-grid subrecord" key={field.id}>
            <Field label="Field label" value={field.label} change={value => changeField(field.id,'label',value)} required maxLength={80} />
            <Field label="Section" value={field.scope} change={value => changeField(field.id,'scope',value)} options={scopes}
              disabled={row.field_definitions.some(previous => previous.id === field.id)} />
            <Field label="Status" value={String(field.active)} change={value => changeField(field.id,'active',value === 'true')} options={booleanOptions} />
            {!row.field_definitions.some(previous => previous.id === field.id) && <button type="button" className="button small delete" onClick={() =>
              setValue('field_definitions',draft.field_definitions.filter(item => item.id !== field.id))}>Remove new field</button>}
          </div>)}
          <button type="button" className="button small" disabled={draft.field_definitions.length >= 50} onClick={() => setValue('field_definitions',[
            ...draft.field_definitions,{ id:crypto.randomUUID(), label:'', scope:'lot', active:true },
          ])}>Add custom field</button>
        </div>}</fieldset>
      </div>
      <div className="dialog-footer"><button className="button" type="button" disabled={saving} onClick={close}>Cancel</button>
        <button className="button primary" disabled={saving || stale}>{saving ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  </Dialog>;
}

export function Settings({ settings, signal, userId, onSaved }) {
  const [editor, setEditor] = useState(null);
  const load = useCallback(() => checked(client.from('members').select('*').order('display_name').limit(1000)), []);
  const members = useResource(load,'members',signal);
  const open = (action,row) => setEditor({ action,row,revision:settings.revision });
  return <>
    <div className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>Register settings</h1></div></div>
    <Panel title="Field names & visibility" secondary="Rename fields and hide optional fields across all devices."
      actions={<button className="button small secondary" onClick={() => open('layout',{ hidden:settings.hidden_fields || [], labels:settings.field_labels || {} })}>Rename or hide fields</button>}>
      <p className="remarks">{Object.keys(settings.field_labels || {}).length} renamed · {(settings.hidden_fields || []).length} hidden</p>
    </Panel>
    <Panel title="Business & custom fields" secondary={settings.business_name}
      actions={<button className="button small secondary" onClick={() => open('book',{ business_name:settings.business_name, field_definitions:settings.field_definitions })}>Edit custom fields</button>}>
      <DataTable label="Custom fields" headings={['Label','Section','Status']}><tbody>
        {settings.field_definitions.length ? settings.field_definitions.map(field => <tr key={field.id}>
          <th scope="row">{field.label}</th><td>{scopes.find(([scope]) => scope === field.scope)?.[1]}</td><td>{field.active ? 'Active' : 'Inactive'}</td></tr>) :
          <tr><td colSpan={3}>No custom fields configured.</td></tr>}
      </tbody></DataTable>
    </Panel>
    <Panel title="Size columns" secondary="Deactivate unused sizes to keep their production history." actions={<button className="button small secondary" onClick={() => open('size',blankSize)}>Add size</button>}>
      <DataTable label="Size settings" headings={['Size','Order','Status','Action']}><tbody>{settings.sizes.map(size => <tr key={size.id}>
        <th scope="row">{size.label}</th><td>{size.position}</td><td>{size.active ? 'Active' : 'Inactive'}</td>
        <td><button className="button small" onClick={() => open('size',size)}>Edit<span className="sr-only"> size {size.label}</span></button></td>
      </tr>)}</tbody></DataTable>
    </Panel>
    <Panel title="Members" secondary="Create the Auth user in Supabase first, then assign access here."
      actions={<button className="button small secondary" onClick={() => open('member',blankMember)}>Add member</button>}>
      <ErrorNotice error={members.error} retry={members.refresh} />
      <DataTable label="Register members" headings={['Name','Role','Status','Action']}><tbody>
        {members.data?.map(member => <tr key={member.user_id}><th scope="row">{member.display_name}</th><td>{member.role}</td><td>{member.active ? 'Active' : 'Inactive'}</td>
          <td>{member.user_id === userId ? 'You' : <button className="button small" onClick={() => open('member',member)}>Edit<span className="sr-only"> {member.display_name}</span></button>}</td></tr>)}
      </tbody></DataTable>
    </Panel>
    <Audit signal={signal} />
    {editor && <SettingsEditor editor={editor} settings={settings} close={() => setEditor(null)} saved={message => { setEditor(null); onSaved(message); }} />}
  </>;
}
