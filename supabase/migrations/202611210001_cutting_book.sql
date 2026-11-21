begin;

create type public.book_role as enum ('admin', 'staff', 'viewer');

create table public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  role public.book_role not null,
  active boolean not null default true
);

create table public.book_settings (
  id boolean primary key default true check (id),
  revision integer not null default 1,
  business_name text not null default 'Jeans Manufacturing' check (length(trim(business_name)) between 1 and 120),
  field_definitions jsonb not null default '[]' check (jsonb_typeof(field_definitions) = 'array')
);
insert into public.book_settings default values;

create table public.archive_signal (
  id boolean primary key default true check (id),
  changed_at timestamptz not null default now()
);
insert into public.archive_signal default values;

create table public.sizes (
  id integer generated always as identity primary key,
  label text not null unique check (length(trim(label)) between 1 and 24),
  position integer not null check (position between 0 and 9999),
  active boolean not null default true
);
insert into public.sizes (label, position) values
  ('28',10), ('30',20), ('32',30), ('34',40), ('36',50), ('38',60), ('40',70), ('42',80);

create table public.lots (
  lot_no text primary key check (lot_no = upper(trim(lot_no)) and length(lot_no) between 1 and 60),
  revision integer not null default 1,
  cutting_date date not null,
  order_no text not null default '', style_no text not null default '', fit text not null default '',
  item text not null default '', party text not null default '', sort_no text not null default '',
  register_no text not null default '', cutting_master text not null default '',
  remarks text not null default '', status text not null default 'open' check (status in ('open','complete')),
  archived boolean not null default false,
  extra jsonb not null default '{}' check (jsonb_typeof(extra) = 'object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null, updated_by uuid not null
);

create table public.fabric_colours (
  id uuid primary key default gen_random_uuid(),
  lot_no text not null references public.lots(lot_no),
  name text not null check (length(trim(name)) between 1 and 100),
  unique (lot_no, id)
);
create unique index fabric_colours_lot_name on public.fabric_colours(lot_no, lower(trim(name)));

create table public.fabric_batches (
  id uuid primary key default gen_random_uuid(),
  lot_no text not null,
  colour_id uuid not null,
  batch_no text not null check (length(trim(batch_no)) between 1 and 120),
  barcode text not null default '',
  supplier text not null default '', bill_no text not null default '', fabric text not null default '',
  received_on date,
  width_inches numeric(8,2) check (width_inches between 0 and 9999),
  shrink_length numeric(5,2) check (shrink_length between 0 and 100),
  shrink_width numeric(5,2) check (shrink_width between 0 and 100),
  roll_count integer check (roll_count between 0 and 1000000),
  metres numeric(12,3) not null check (metres between 0 and 100000000),
  remarks text not null default '',
  extra jsonb not null default '{}' check (jsonb_typeof(extra) = 'object'),
  unique (lot_no,id),
  foreign key (lot_no,colour_id) references public.fabric_colours(lot_no,id)
);
create index fabric_batches_colour on public.fabric_batches(lot_no,colour_id);

create table public.cuts (
  id uuid primary key default gen_random_uuid(),
  lot_no text not null,
  batch_id uuid not null,
  cut_on date not null,
  reference text not null default '',
  method text not null check (method in ('actual','ratio')),
  layers integer check (layers between 0 and 100000),
  marker_metres numeric(12,3) check (marker_metres between 0 and 100000000),
  roll_metres numeric(12,3) check (roll_metres between 0 and 100000000),
  main_used numeric(12,3) not null check (main_used between 0 and 100000000),
  balance_used numeric(12,3) not null check (balance_used between 0 and 100000000),
  waste_metres numeric(12,3) not null check (waste_metres between 0 and 100000000),
  remarks text not null default '',
  extra jsonb not null default '{}' check (jsonb_typeof(extra) = 'object'),
  unique (lot_no,id),
  foreign key (lot_no,batch_id) references public.fabric_batches(lot_no,id),
  check (method <> 'ratio' or layers > 0 and layers is not null)
);
create index cuts_batch on public.cuts(lot_no,batch_id);
create index cuts_date on public.cuts(cut_on);

create table public.cut_quantities (
  lot_no text not null,
  cut_id uuid not null,
  size_id integer not null references public.sizes(id),
  ratio integer not null default 0 check (ratio between 0 and 1000),
  pieces integer not null default 0 check (pieces between 0 and 100000000),
  balance_pieces integer not null default 0 check (balance_pieces between 0 and 100000000),
  primary key (cut_id,size_id),
  foreign key (lot_no,cut_id) references public.cuts(lot_no,id) on delete cascade
);
create index cut_quantities_lot on public.cut_quantities(lot_no,cut_id);

create table public.jobwork (
  id uuid primary key default gen_random_uuid(),
  lot_no text not null references public.lots(lot_no),
  issued_on date not null,
  work_type text not null check (length(trim(work_type)) between 1 and 120),
  worker text not null check (length(trim(worker)) between 1 and 120),
  bundle text not null default '',
  issued integer not null check (issued between 1 and 100000000),
  received_on date,
  received integer not null default 0 check (received >= 0),
  damaged integer not null default 0 check (damaged >= 0),
  rate numeric(12,2) not null default 0 check (rate between 0 and 100000000),
  signed_by text not null default '', remarks text not null default '',
  extra jsonb not null default '{}' check (jsonb_typeof(extra) = 'object'),
  check (received::bigint + damaged <= issued),
  check (received_on is null or received_on >= issued_on),
  check (received + damaged = 0 or received_on is not null)
);
create index jobwork_lot on public.jobwork(lot_no);
create index lots_updated on public.lots(updated_at desc,lot_no);

create table public.audit_history (
  id bigint generated always as identity primary key,
  lot_no text references public.lots(lot_no),
  changed_at timestamptz not null default now(),
  actor_id uuid,
  actor_name text not null,
  entity text not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  before_data jsonb,
  after_data jsonb
);
create index audit_lot on public.audit_history(lot_no,id desc);

create function public.my_role() returns public.book_role
language sql stable security definer set search_path = '' as $$
  select role from public.members where user_id = auth.uid() and active
$$;

do $$
declare relation text;
begin
  foreach relation in array array['members','book_settings','archive_signal','sizes','lots','fabric_colours',
    'fabric_batches','cuts','cut_quantities','jobwork','audit_history'] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from public, anon, authenticated', relation);
    execute format('grant select on public.%I to authenticated', relation);
    if relation = 'members' then
      create policy member_read on public.members for select to authenticated
        using (user_id = (select auth.uid()) or (select public.my_role()) = 'admin');
    elsif relation = 'audit_history' then
      create policy audit_read on public.audit_history for select to authenticated
        using ((select public.my_role()) = 'admin' or
          ((select public.my_role()) is not null and lot_no is not null and
           exists (select 1 from public.lots where lots.lot_no = audit_history.lot_no and not archived)));
    elsif relation = 'lots' then
      create policy lot_read on public.lots for select to authenticated
        using ((select public.my_role()) is not null and (not archived or (select public.my_role()) = 'admin'));
    elsif relation in ('book_settings','archive_signal','sizes') then
      execute format('create policy book_read on public.%I for select to authenticated using ((select public.my_role()) is not null)', relation);
    else
      execute format('create policy child_read on public.%1$I for select to authenticated using (exists (select 1 from public.lots where lots.lot_no = %1$I.lot_no))', relation);
    end if;
  end loop;
end $$;

create schema if not exists cutting_private;
revoke all on schema cutting_private from public, anon, authenticated;

create function cutting_private.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  previous jsonb;
  current_row jsonb;
  actor text;
begin
  if tg_op <> 'INSERT' then previous := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then current_row := to_jsonb(new); end if;
  if previous is not distinct from current_row then return null; end if;
  if tg_table_name = 'lots' and tg_op = 'UPDATE' and
    (previous - array['revision','updated_at','updated_by']) = (current_row - array['revision','updated_at','updated_by']) then
    return null;
  end if;
  select display_name into actor from public.members where user_id = auth.uid();
  insert into public.audit_history(lot_no, actor_id, actor_name, entity, action, before_data, after_data)
  values (coalesce(current_row,previous)->>'lot_no', auth.uid(), coalesce(actor, 'Database operator'),
          tg_table_name, tg_op, previous, current_row);
  return null;
end $$;

do $$
declare relation text;
begin
  foreach relation in array array['members','book_settings','sizes','lots','fabric_colours','fabric_batches','cuts','cut_quantities','jobwork'] loop
    execute format('create trigger write_audit after insert or update or delete on public.%I for each row execute function cutting_private.audit_change()', relation);
  end loop;
end $$;

create function cutting_private.valid_extra(scope text, fields jsonb, old_fields jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  field record;
begin
  fields := coalesce(fields, '{}'::jsonb);
  if jsonb_typeof(fields) <> 'object' or pg_column_size(fields) > 80000 then
    raise exception 'Invalid custom field values';
  end if;
  for field in select * from jsonb_each(fields) loop
    if jsonb_typeof(field.value) <> 'string' or length(field.value #>> '{}') > 2000 then
      raise exception 'Custom field values must be text, up to 2,000 characters';
    end if;
    if field.value is distinct from old_fields->field.key and not exists (
      select 1 from public.book_settings cross join lateral jsonb_array_elements(field_definitions) definition
      where definition->>'id' = field.key and definition->>'scope' = scope and (definition->>'active')::boolean
    ) then raise exception 'A custom field is no longer available. Reload settings.'; end if;
  end loop;
  fields := coalesce(old_fields,'{}'::jsonb) || fields;
  if pg_column_size(fields) > 80000 then raise exception 'Custom field values are too large'; end if;
  return fields;
end $$;

create function public.change_lot(lot text, expected integer, entity text, operation text, payload jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  permission public.book_role := public.my_role();
  current_lot public.lots;
  lot_input public.lots;
  batch_input public.fabric_batches;
  cut_input public.cuts;
  job_input public.jobwork;
  quantity public.cut_quantities;
  item_id uuid;
  affected_rows integer;
  item jsonb;
  size_keys integer[] := '{}';
  previous_extra jsonb;
begin
  if permission is null or permission = 'viewer' or
     (operation in ('delete','restore') and permission <> 'admin') then
    raise exception 'Your role cannot perform this action' using errcode = '42501';
  end if;
  if operation is null or operation not in ('create','update','delete','restore') or
     entity is null or entity not in ('lot','colour','batch','cut','jobwork') or
     (operation = 'restore' and entity <> 'lot') or jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Invalid change';
  end if;
  if pg_column_size(payload) > 200000 then raise exception 'Record is too large'; end if;
  lot := upper(trim(lot));

  if entity = 'lot' and operation = 'create' then
    lot_input := jsonb_populate_record(null::public.lots,payload);
    insert into public.lots(lot_no,cutting_date,order_no,style_no,fit,item,party,sort_no,register_no,cutting_master,
      remarks,extra,created_by,updated_by)
    values(lot,lot_input.cutting_date,lot_input.order_no,lot_input.style_no,lot_input.fit,lot_input.item,lot_input.party,
      lot_input.sort_no,lot_input.register_no,lot_input.cutting_master,lot_input.remarks,
      cutting_private.valid_extra('lot',lot_input.extra,'{}'),auth.uid(),auth.uid());
    return 1;
  end if;

  select * into current_lot from public.lots where lot_no = lot for update;
  if not found or (current_lot.archived and (entity <> 'lot' or operation <> 'restore')) then
    raise exception 'This lot is unavailable' using errcode = 'P0002';
  end if;
  if expected is distinct from current_lot.revision then
    raise exception 'This lot changed on another device. Reload the lot before saving.' using errcode = '40001';
  end if;
  if entity <> 'lot' and operation <> 'create' then item_id := (payload->>'id')::uuid; end if;

  case entity
  when 'lot' then
    if operation in ('delete','restore') then
      update public.lots set archived = (operation = 'delete') where lot_no = lot;
      update public.archive_signal set changed_at = clock_timestamp() where id;
    else
      lot_input := jsonb_populate_record(current_lot,payload);
      if lot_input.status = 'complete' and not exists (
        select 1 from public.cut_quantities where lot_no = lot and pieces + balance_pieces > 0
      ) then raise exception 'Add cutting quantities before completing this lot'; end if;
      update public.lots set cutting_date = lot_input.cutting_date, order_no = lot_input.order_no,
        style_no = lot_input.style_no, fit = lot_input.fit, item = lot_input.item, party = lot_input.party,
        sort_no = lot_input.sort_no, register_no = lot_input.register_no, cutting_master = lot_input.cutting_master,
        remarks = lot_input.remarks, status = lot_input.status,
        extra = cutting_private.valid_extra('lot',lot_input.extra,current_lot.extra) where lot_no = lot;
    end if;
  when 'colour' then
    if operation = 'delete' then
      delete from public.fabric_colours where lot_no = lot and id = item_id;
    elsif operation = 'create' then
      insert into public.fabric_colours(lot_no,name) values(lot,trim(payload->>'name'));
    else
      update public.fabric_colours set name = trim(payload->>'name') where lot_no = lot and id = item_id;
    end if;
  when 'batch' then
    if operation = 'delete' then
      delete from public.fabric_batches where lot_no = lot and id = item_id;
    else
      if operation = 'update' then
        select * into batch_input from public.fabric_batches where lot_no = lot and id = item_id;
        if not found then raise exception 'Batch not found'; end if;
      end if;
      previous_extra := coalesce(batch_input.extra,'{}');
      batch_input := jsonb_populate_record(batch_input,payload);
      batch_input.extra := cutting_private.valid_extra('batch',batch_input.extra,previous_extra);
      if operation = 'create' then
        insert into public.fabric_batches(lot_no,colour_id,batch_no,barcode,supplier,bill_no,fabric,received_on,
          width_inches,shrink_length,shrink_width,roll_count,metres,remarks,extra)
        values(lot,batch_input.colour_id,trim(batch_input.batch_no),batch_input.barcode,batch_input.supplier,
          batch_input.bill_no,batch_input.fabric,batch_input.received_on,batch_input.width_inches,
          batch_input.shrink_length,batch_input.shrink_width,batch_input.roll_count,batch_input.metres,batch_input.remarks,batch_input.extra);
      else
        update public.fabric_batches set colour_id = batch_input.colour_id, batch_no = trim(batch_input.batch_no),
          barcode = batch_input.barcode, supplier = batch_input.supplier, bill_no = batch_input.bill_no,
          fabric = batch_input.fabric, received_on = batch_input.received_on, width_inches = batch_input.width_inches,
          shrink_length = batch_input.shrink_length, shrink_width = batch_input.shrink_width, roll_count = batch_input.roll_count,
          metres = batch_input.metres, remarks = batch_input.remarks, extra = batch_input.extra where lot_no = lot and id = item_id;
      end if;
    end if;
  when 'cut' then
    if operation = 'delete' then
      delete from public.cuts where lot_no = lot and id = item_id;
    else
      if operation = 'update' then
        select * into cut_input from public.cuts where lot_no = lot and id = item_id;
        if not found then raise exception 'Cut not found'; end if;
      end if;
      previous_extra := coalesce(cut_input.extra,'{}');
      cut_input := jsonb_populate_record(cut_input,payload);
      cut_input.extra := cutting_private.valid_extra('cut',cut_input.extra,previous_extra);
      if operation = 'create' then
        insert into public.cuts(lot_no,batch_id,cut_on,reference,method,layers,marker_metres,roll_metres,main_used,balance_used,waste_metres,remarks,extra)
        values(lot,cut_input.batch_id,cut_input.cut_on,cut_input.reference,cut_input.method,cut_input.layers,
          cut_input.marker_metres,cut_input.roll_metres,cut_input.main_used,cut_input.balance_used,cut_input.waste_metres,cut_input.remarks,cut_input.extra)
        returning id into item_id;
      else
        update public.cuts set batch_id = cut_input.batch_id, cut_on = cut_input.cut_on, reference = cut_input.reference,
          method = cut_input.method, layers = cut_input.layers, marker_metres = cut_input.marker_metres,
          roll_metres = cut_input.roll_metres, main_used = cut_input.main_used, balance_used = cut_input.balance_used,
          waste_metres = cut_input.waste_metres, remarks = cut_input.remarks, extra = cut_input.extra where lot_no = lot and id = item_id;
      end if;
      if jsonb_typeof(payload->'quantities') is distinct from 'array' or jsonb_array_length(payload->'quantities') > 250 then
        raise exception 'Provide up to 250 size rows';
      end if;
      for item in select value from jsonb_array_elements(payload->'quantities') loop
        quantity := jsonb_populate_record(null::public.cut_quantities,item);
        if quantity.size_id is null or quantity.size_id = any(size_keys) then raise exception 'Duplicate or missing size'; end if;
        if not exists (select 1 from public.sizes where id = quantity.size_id and active) and not exists (
          select 1 from public.cut_quantities where cut_id = item_id and size_id = quantity.size_id
        ) then raise exception 'A selected size is unavailable. Reload settings.'; end if;
        size_keys := array_append(size_keys,quantity.size_id);
        if cut_input.method = 'ratio' then quantity.pieces := quantity.ratio * cut_input.layers; end if;
        insert into public.cut_quantities(lot_no,cut_id,size_id,ratio,pieces,balance_pieces)
        values(lot,item_id,quantity.size_id,quantity.ratio,quantity.pieces,quantity.balance_pieces)
        on conflict (cut_id,size_id) do update set ratio = excluded.ratio, pieces = excluded.pieces, balance_pieces = excluded.balance_pieces
        where (cut_quantities.ratio,cut_quantities.pieces,cut_quantities.balance_pieces)
          is distinct from (excluded.ratio,excluded.pieces,excluded.balance_pieces);
      end loop;
      delete from public.cut_quantities where cut_id = item_id and not (size_id = any(size_keys));
    end if;
  when 'jobwork' then
    if operation = 'delete' then
      delete from public.jobwork where lot_no = lot and id = item_id;
    else
      if operation = 'update' then
        select * into job_input from public.jobwork where lot_no = lot and id = item_id;
        if not found then raise exception 'Jobwork row not found'; end if;
      end if;
      previous_extra := coalesce(job_input.extra,'{}');
      job_input := jsonb_populate_record(job_input,payload);
      job_input.extra := cutting_private.valid_extra('jobwork',job_input.extra,previous_extra);
      if operation = 'create' then
        insert into public.jobwork(lot_no,issued_on,work_type,worker,bundle,issued,received_on,received,damaged,rate,signed_by,remarks,extra)
        values(lot,job_input.issued_on,job_input.work_type,job_input.worker,job_input.bundle,job_input.issued,
          job_input.received_on,job_input.received,job_input.damaged,job_input.rate,job_input.signed_by,job_input.remarks,job_input.extra);
      else
        update public.jobwork set issued_on = job_input.issued_on, work_type = job_input.work_type, worker = job_input.worker,
          bundle = job_input.bundle, issued = job_input.issued, received_on = job_input.received_on, received = job_input.received,
          damaged = job_input.damaged, rate = job_input.rate, signed_by = job_input.signed_by, remarks = job_input.remarks,
          extra = job_input.extra where lot_no = lot and id = item_id;
      end if;
    end if;
  end case;

  get diagnostics affected_rows = row_count;
  if entity <> 'lot' and operation = 'delete' and affected_rows <> 1 then raise exception 'The record no longer exists'; end if;
  if entity = 'colour' and operation = 'update' and affected_rows <> 1 then raise exception 'Colour not found'; end if;
  update public.lots set revision = revision + 1, updated_by = auth.uid(), updated_at = clock_timestamp(),
    status = case when entity = 'cut' and status = 'complete' and not exists (
      select 1 from public.cut_quantities where lot_no = lot and pieces + balance_pieces > 0
    ) then 'open' else status end where lot_no = lot returning revision into expected;
  return expected;
end $$;

create function public.change_settings(expected integer, action text, payload jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  settings public.book_settings;
  field jsonb;
  previous_field jsonb;
  identifiers text[] := '{}';
  label_value text;
  changed integer;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Admin access required' using errcode = '42501'; end if;
  select * into settings from public.book_settings where id for update;
  if expected is distinct from settings.revision then
    raise exception 'Settings changed on another device. Reload settings.' using errcode = '40001';
  end if;
  case action
  when 'book' then
    if jsonb_typeof(payload->'field_definitions') is distinct from 'array' or jsonb_array_length(payload->'field_definitions') > 50 then
      raise exception 'Provide up to 50 custom fields';
    end if;
    for field in select value from jsonb_array_elements(payload->'field_definitions') loop
      if coalesce(field->>'id','') !~ '^[a-f0-9-]{36}$' or (field->>'id') = any(identifiers) or
         coalesce(field->>'scope','') not in ('lot','batch','cut','jobwork') or
         coalesce(length(trim(field->>'label')),0) not between 1 and 80 or
         jsonb_typeof(field->'active') is distinct from 'boolean' or pg_column_size(field) > 1000 then
        raise exception 'Invalid custom field definition';
      end if;
      identifiers := array_append(identifiers,field->>'id');
    end loop;
    for previous_field in select value from jsonb_array_elements(settings.field_definitions) loop
      if not exists (select 1 from jsonb_array_elements(payload->'field_definitions') current_field
        where current_field->>'id' = previous_field->>'id' and current_field->>'scope' = previous_field->>'scope') then
        raise exception 'Deactivate existing custom fields to preserve their history';
      end if;
    end loop;
    update public.book_settings set business_name = trim(payload->>'business_name'), field_definitions = payload->'field_definitions' where id;
  when 'size' then
    if payload->>'id' is null then
      if (select count(*) from public.sizes) >= 250 then raise exception 'The register supports up to 250 sizes'; end if;
      label_value := trim(payload->>'label');
      if exists (select 1 from public.sizes where lower(label) = lower(label_value)) then raise exception 'That size already exists'; end if;
      insert into public.sizes(label,position) values(label_value,(payload->>'position')::integer);
    else
      update public.sizes set position = (payload->>'position')::integer, active = (payload->>'active')::boolean
      where id = (payload->>'id')::integer;
      if not found then raise exception 'Size not found'; end if;
    end if;
  when 'member' then
    if (payload->>'user_id')::uuid = auth.uid() then raise exception 'Another admin must change your membership'; end if;
    insert into public.members(user_id,display_name,role,active)
    values((payload->>'user_id')::uuid,trim(payload->>'display_name'),(payload->>'role')::public.book_role,(payload->>'active')::boolean)
    on conflict(user_id) do update set display_name = excluded.display_name, role = excluded.role, active = excluded.active;
  else raise exception 'Invalid settings action';
  end case;
  update public.book_settings set revision = revision + 1 where id returning revision into changed;
  return changed;
end $$;

revoke execute on function public.my_role(), public.change_lot(text,integer,text,text,jsonb),
  public.change_settings(integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.my_role(), public.change_lot(text,integer,text,text,jsonb),
  public.change_settings(integer,text,jsonb) to authenticated;

alter publication supabase_realtime add table public.lots, public.book_settings, public.members, public.archive_signal;

commit;
