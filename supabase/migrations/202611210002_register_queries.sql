begin;

create function public.register_settings() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select to_jsonb(settings) || jsonb_build_object('sizes',coalesce((
    select jsonb_agg(to_jsonb(size) order by position,id) from public.sizes size
  ),'[]')) from public.book_settings settings where id
$$;

create function public.lot_record(lot text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'lot',to_jsonb(record),
    'colours',coalesce((select jsonb_agg(to_jsonb(item.*) order by item.name) from public.fabric_colours item where item.lot_no = lot),'[]'),
    'batches',coalesce((select jsonb_agg(to_jsonb(item.*) order by item.received_on,item.batch_no,item.id) from public.fabric_batches item where item.lot_no = lot),'[]'),
    'cuts',coalesce((select jsonb_agg(to_jsonb(item.*) || jsonb_build_object('quantities',coalesce((
        select jsonb_agg(to_jsonb(quantity) order by quantity.size_id) from public.cut_quantities quantity where quantity.cut_id = item.id
      ),'[]')) order by item.cut_on,item.reference,item.id) from public.cuts item where item.lot_no = lot),'[]'),
    'jobwork',coalesce((select jsonb_agg(to_jsonb(item.*) order by item.issued_on,item.work_type,item.id) from public.jobwork item where item.lot_no = lot),'[]')
  ) from public.lots record where record.lot_no = lot
$$;

create function public.lot_search(term text, start_on date, end_on date, style text, colour text,
  state text, page_number integer) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with matching as materialized (
    select record.* from public.lots record
    where record.archived = (coalesce(state,'') = 'archived')
      and (coalesce(state,'') not in ('open','complete') or record.status = state)
      and (start_on is null or record.cutting_date >= start_on) and (end_on is null or record.cutting_date <= end_on)
      and strpos(lower(record.style_no),lower(trim(coalesce(style,'')))) > 0
      and (nullif(trim(colour),'') is null or exists (
        select 1 from public.fabric_colours shade where shade.lot_no = record.lot_no
          and strpos(lower(shade.name),lower(trim(colour))) > 0
      ))
      and (nullif(trim(term),'') is null or
        strpos(lower(concat_ws(' ', record.lot_no,record.cutting_date,record.order_no,record.style_no)),lower(trim(term))) > 0
        or exists (select 1 from public.fabric_batches batch where batch.lot_no = record.lot_no
          and strpos(lower(concat_ws(' ',batch.batch_no,batch.barcode)),lower(trim(term))) > 0)
        or exists (select 1 from public.fabric_colours shade where shade.lot_no = record.lot_no
          and strpos(lower(shade.name),lower(trim(term))) > 0)
        or exists (select 1 from public.cuts cut where cut.lot_no = record.lot_no
          and strpos(cut.cut_on::text,trim(term)) > 0))
  ), page as (
    select * from matching order by updated_at desc, lot_no limit 25
      offset (greatest(0,least(coalesce(page_number,0),1000000))::bigint * 25)
  )
  select jsonb_build_object('count',(select count(*) from matching),'rows',coalesce((
    select jsonb_agg(to_jsonb(page) || jsonb_build_object('pieces',coalesce((select sum(pieces::bigint + balance_pieces)
      from public.cut_quantities quantity where quantity.lot_no = page.lot_no),0)) order by page.updated_at desc,page.lot_no)
    from page
  ),'[]'))
$$;

create function public.book_dashboard() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'lots',(select count(*) from public.lots where not archived),
    'pending',(select count(*) from public.lots where not archived and status = 'open'),
    'entries',(select count(*) from public.cuts join public.lots using (lot_no) where not archived),
    'pieces',coalesce(sum(quantity.pieces::bigint + quantity.balance_pieces),0),
    'today',coalesce(sum(quantity.pieces::bigint + quantity.balance_pieces)
      filter (where cut.cut_on = (now() at time zone 'Asia/Kolkata')::date),0),
    'recent',public.lot_search('',null,null,'','','',0)->'rows'
  ) from public.cut_quantities quantity join public.cuts cut on cut.id = quantity.cut_id
    join public.lots record on record.lot_no = cut.lot_no where not record.archived
$$;

create function public.production_report(group_by text, start_on date, end_on date, lot_filter text, colour_filter text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with production as (
    select case group_by when 'lot' then cut.lot_no when 'date' then cut.cut_on::text
        when 'colour' then lower(shade.name) when 'size' then size.id::text else 'All production' end as group_key,
      case group_by when 'lot' then cut.lot_no when 'date' then cut.cut_on::text
        when 'colour' then shade.name when 'size' then size.label else 'All production' end as label,
      case when group_by = 'size' then size.position else 0 end as position,
      cut.id, quantity.pieces, quantity.balance_pieces
    from public.cut_quantities quantity join public.cuts cut on cut.id = quantity.cut_id
      join public.lots record on record.lot_no = cut.lot_no
      join public.fabric_batches batch on batch.id = cut.batch_id
      join public.fabric_colours shade on shade.id = batch.colour_id
      join public.sizes size on size.id = quantity.size_id
    where not record.archived and quantity.pieces + quantity.balance_pieces > 0
      and (start_on is null or cut.cut_on >= start_on) and (end_on is null or cut.cut_on <= end_on)
      and (nullif(trim(lot_filter),'') is null or cut.lot_no = upper(trim(lot_filter)))
      and (nullif(trim(colour_filter),'') is null or lower(shade.name) = lower(trim(colour_filter)))
  ), grouped as (
    select min(label) as label,min(position) as position,count(distinct id) as entries,
      sum(pieces::bigint) as main,sum(balance_pieces::bigint) as balance,sum(pieces::bigint + balance_pieces) as total
    from production group by group_key
  )
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(grouped) - 'position' order by position,label) from grouped),'[]'),
    'entries',count(distinct id),'main',coalesce(sum(pieces::bigint),0),'balance',coalesce(sum(balance_pieces::bigint),0),
    'total',coalesce(sum(pieces::bigint + balance_pieces),0)) from production
$$;

revoke execute on function public.register_settings(), public.lot_record(text),public.lot_search(text,date,date,text,text,text,integer),
  public.book_dashboard(),public.production_report(text,date,date,text,text) from public, anon, authenticated;
grant execute on function public.register_settings(), public.lot_record(text),public.lot_search(text,date,date,text,text,text,integer),
  public.book_dashboard(),public.production_report(text,date,date,text,text) to authenticated;

commit;
