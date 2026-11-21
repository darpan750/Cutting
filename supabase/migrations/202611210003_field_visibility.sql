begin;

alter table public.book_settings
  add column hidden_fields text[] not null default '{}',
  add column field_labels jsonb not null default '{}' check (jsonb_typeof(field_labels) = 'object');

create function public.change_field_layout(expected integer, hidden text[], labels jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  current_revision integer;
  optional_fields constant text[] := array[
    'lot.order_no','lot.style_no','lot.fit','lot.item','lot.party','lot.sort_no','lot.register_no','lot.cutting_master','lot.remarks',
    'batch.barcode','batch.supplier','batch.bill_no','batch.fabric','batch.received_on','batch.width_inches','batch.roll_count',
    'batch.shrink_length','batch.shrink_width','batch.remarks',
    'cut.reference','cut.roll_metres','cut.marker_metres','cut.remarks',
    'jobwork.bundle','jobwork.signed_by','jobwork.remarks'
  ];
  required_fields constant text[] := array[
    'lot.lot_no','lot.cutting_date','lot.status','colour.name','batch.colour_id','batch.batch_no','batch.metres',
    'cut.batch_id','cut.method','cut.cut_on','cut.layers','cut.main_used','cut.balance_used','cut.waste_metres',
    'cut.size_quantities','cut.pieces','cut.balance_pieces',
    'jobwork.issued_on','jobwork.work_type','jobwork.worker','jobwork.issued','jobwork.received_on','jobwork.received','jobwork.damaged','jobwork.rate'
  ];
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Admin access required' using errcode = '42501'; end if;
  if hidden is null or cardinality(hidden) > cardinality(optional_fields) or
     exists (select 1 from unnest(hidden) as entry(field) where field is null or not (field = any(optional_fields))) then
    raise exception 'Only optional fields can be hidden' using errcode = '22023';
  end if;
  if jsonb_typeof(labels) is distinct from 'object' or exists (
    select 1 from jsonb_each(labels) as entry(field, label)
    where not (field = any(optional_fields || required_fields)) or jsonb_typeof(label) <> 'string'
      or length(trim(label #>> '{}')) not between 1 and 60
  ) then raise exception 'Field names must contain 1 to 60 characters' using errcode = '22023'; end if;
  select revision into current_revision from public.book_settings where id for update;
  if expected is distinct from current_revision then
    raise exception 'Settings changed on another device. Reload settings.' using errcode = '40001';
  end if;
  update public.book_settings set hidden_fields = array(select distinct field from unnest(hidden) as entry(field) order by field),field_labels = labels,
    revision = revision + 1 where id returning revision into current_revision;
  return current_revision;
end $$;

revoke execute on function public.change_field_layout(integer,text[],jsonb) from public, anon, authenticated;
grant execute on function public.change_field_layout(integer,text[],jsonb) to authenticated;

commit;
