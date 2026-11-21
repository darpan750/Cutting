import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const admin = '00000000-0000-4000-8000-000000000001';
const staff = '00000000-0000-4000-8000-000000000002';
const viewer = '00000000-0000-4000-8000-000000000003';
const unassigned = '00000000-0000-4000-8000-000000000004';

test('migrations enforce roles, lot linkage, atomic cuts, audit and stale-write rejection', async () => {
  const database = await PGlite.create();
  try {
    await database.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create publication supabase_realtime;
    `);
    for (const file of ['202611210001_cutting_book.sql','202611210002_register_queries.sql']) {
      await database.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
    }
    await database.query('insert into auth.users values ($1),($2),($3),($4)',[admin,staff,viewer,unassigned]);
    await database.query("insert into public.members(user_id,display_name,role) values ($1,'Admin','admin'),($2,'Staff','staff'),($3,'Viewer','viewer')",[admin,staff,viewer]);
    const login = async user => {
      await database.exec('reset role');
      await database.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
      await database.exec('set role authenticated');
    };
    const change = async (lot,revision,entity,operation,payload) => (await database.query(
      'select public.change_lot($1,$2,$3,$4,$5) as revision',[lot,revision,entity,operation,JSON.stringify(payload)]
    )).rows[0].revision;
    const record = async lot => (await database.query('select public.lot_record($1) as record',[lot])).rows[0].record;
    const input = { cutting_date:'2026-11-21',order_no:'SO-10',style_no:'1001',fit:'Straight',item:'Jeans',party:'',sort_no:'',register_no:'',cutting_master:'',remarks:'',extra:{} };

    await database.exec('set role anon');
    await assert.rejects(database.query('select * from public.lots'),{ code:'42501' });
    await login(staff);
    assert.equal(await change('  a-100 ',null,'lot','create',input),1);
    await assert.rejects(change('A-100',null,'lot','create',input),{ code:'23505' });
    await change('B-100',null,'lot','create',input);
    assert.equal(await change('A-100',1,'colour','create',{ name:'Navy' }),2);
    await assert.rejects(change('A-100',1,'lot','update',{ remarks:'stale' }),{ code:'40001' });
    const colour = (await record('A-100')).colours[0].id;
    const batch = { colour_id:colour,batch_no:'ROLL-10',barcode:'BAR-10',supplier:'Mill',bill_no:'',fabric:'Denim',metres:100,remarks:'',extra:{} };
    await assert.rejects(change('B-100',1,'batch','create',batch),{ code:'23503' });
    assert.equal(await change('A-100',2,'batch','create',batch),3);
    const batchId = (await record('A-100')).batches[0].id;
    const cut = { batch_id:batchId,cut_on:'2026-11-21',reference:'R1',method:'ratio',layers:9,main_used:93.42,balance_used:2,waste_metres:1,remarks:'',extra:{},quantities:[{ size_id:1,ratio:2,pieces:99,balance_pieces:3 },{ size_id:2,ratio:1,pieces:0,balance_pieces:0 }] };
    await assert.rejects(change('A-100',3,'cut','create',{ ...cut, quantities:[cut.quantities[0],{ ...cut.quantities[1],size_id:9999 }] }));
    assert.equal((await record('A-100')).cuts.length,0);
    assert.equal(await change('A-100',3,'cut','create',cut),4);
    assert.equal((await record('A-100')).cuts[0].quantities[0].pieces,18);
    const results = (await database.query("select public.production_report('size',null,null,'A-100','Navy') as report")).rows[0].report;
    assert.equal(results.entries,1);
    assert.equal(results.total,30);
    assert.equal(results.rows.length,2);
    const search = (await database.query("select public.lot_search('BAR-10',null,null,'1001','navy','',0) as results")).rows[0].results;
    assert.equal(search.count,1);
    assert.equal(search.rows[0].pieces,30);
    assert.equal((await database.query("select public.book_dashboard()->>'pieces' as pieces")).rows[0].pieces,'30');
    assert.equal((await database.query("select count(*)::int as count from public.audit_history where lot_no='A-100' and actor_id=$1",[staff])).rows[0].count,6);
    await assert.rejects(change('A-100',4,'lot','delete',{}),{ code:'42501' });
    await assert.rejects(database.query("update public.lots set revision=77 where lot_no='A-100'"),{ code:'42501' });

    await login(viewer);
    assert.equal((await record('A-100')).lot.revision,4);
    await assert.rejects(change('A-100',4,'lot','update',{ remarks:'edit' }),{ code:'42501' });
    await login(unassigned);
    assert.equal(await record('A-100'),null);
    await login(admin);
    assert.equal(await change('A-100',4,'lot','delete',{}),5);
    await login(viewer);
    assert.equal(await record('A-100'),null);
    await login(admin);
    assert.equal(await change('A-100',5,'lot','restore',{}),6);
    assert.equal((await record('A-100')).lot.archived,false);
  } finally {
    await database.close();
  }
});
