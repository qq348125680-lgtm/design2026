
-- 在线专家评审系统：Supabase 初始化 SQL（修正版，可重复执行）
-- 说明：Supabase 的 pgcrypto 通常安装在 extensions schema，
-- 因此必须显式使用 extensions.crypt / extensions.gen_salt。

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists app_settings (
  id int primary key default 1,
  admin_secret_hash text not null
);

-- 默认管理员口令：123456
insert into app_settings(id,admin_secret_hash)
values(1, extensions.crypt('123456', extensions.gen_salt('bf')))
on conflict (id) do nothing;

create table if not exists judges(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code_hash text not null,
  code_plain text not null,
  created_at timestamptz default now()
);

create table if not exists works(
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  manifest jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists scores(
  id uuid primary key default gen_random_uuid(),
  judge_id uuid references judges(id) on delete cascade,
  work_id uuid references works(id) on delete cascade,
  c1 numeric not null,
  c2 numeric not null,
  c3 numeric not null,
  c4 numeric not null,
  c5 numeric not null,
  comment text default '',
  updated_at timestamptz default now(),
  unique(judge_id,work_id)
);

alter table judges enable row level security;
alter table works enable row level security;
alter table scores enable row level security;
alter table app_settings enable row level security;

revoke all on judges,works,scores,app_settings from anon, authenticated;

create or replace function admin_ok(p_secret text) returns boolean
language sql security definer
set search_path=public,extensions
as $$
  select extensions.crypt(p_secret,admin_secret_hash)=admin_secret_hash
  from app_settings where id=1
$$;

create or replace function admin_check(p_secret text) returns boolean
language sql security definer
set search_path=public,extensions
as $$ select admin_ok(p_secret) $$;

create or replace function admin_add_judge(p_secret text,p_name text,p_code text) returns uuid
language plpgsql security definer
set search_path=public,extensions
as $$
declare v uuid;
begin
  if not admin_ok(p_secret) then raise exception 'unauthorized'; end if;
  insert into judges(name,code_hash,code_plain)
  values(p_name,extensions.crypt(p_code,extensions.gen_salt('bf')),p_code)
  returning id into v;
  return v;
end $$;

create or replace function admin_delete_judge(p_secret text,p_judge_id uuid) returns boolean
language plpgsql security definer
set search_path=public,extensions
as $$
begin
  if not admin_ok(p_secret) then raise exception 'unauthorized'; end if;
  delete from judges where id=p_judge_id;
  return true;
end $$;

create or replace function admin_create_work(p_secret text,p_code text,p_name text) returns uuid
language plpgsql security definer
set search_path=public,extensions
as $$
declare v uuid;
begin
  if not admin_ok(p_secret) then raise exception 'unauthorized'; end if;
  insert into works(code,name) values(p_code,p_name) returning id into v;
  return v;
end $$;

create or replace function admin_set_manifest(p_secret text,p_work_id uuid,p_manifest jsonb) returns boolean
language plpgsql security definer
set search_path=public,extensions
as $$
begin
  if not admin_ok(p_secret) then raise exception 'unauthorized'; end if;
  update works set manifest=p_manifest where id=p_work_id;
  return true;
end $$;

create or replace function admin_delete_work(p_secret text,p_work_id uuid) returns boolean
language plpgsql security definer
set search_path=public,extensions
as $$
begin
  if not admin_ok(p_secret) then raise exception 'unauthorized'; end if;
  delete from works where id=p_work_id;
  return true;
end $$;

create or replace function admin_dashboard(p_secret text) returns jsonb
language plpgsql security definer
set search_path=public,extensions
as $$
declare r jsonb;
begin
 if not admin_ok(p_secret) then raise exception 'unauthorized'; end if;

 select jsonb_build_object(
  'works',
    coalesce((select jsonb_agg(to_jsonb(w) order by w.code) from works w),'[]'::jsonb),

  'judges',
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id',id,'name',name,'code',code_plain)
        order by created_at
      ) from judges
    ),'[]'::jsonb),

  'score_count',
    (select count(*) from scores),

  'summary',
    coalesce((
      select jsonb_agg(x order by x->>'code')
      from (
        select jsonb_build_object(
          'code',w.code,
          'name',w.name,
          'judged_count',count(s.id),
          'avg_score',round(avg(s.c1+s.c2+s.c3+s.c4+s.c5),2)
        ) x
        from works w
        left join scores s on s.work_id=w.id
        group by w.id,w.code,w.name
      ) q
    ),'[]'::jsonb)
 ) into r;

 return r;
end $$;

create or replace function judge_login(p_code text) returns jsonb
language sql security definer
set search_path=public,extensions
as $$
 select coalesce(
   (
     select jsonb_build_object('ok',true,'name',name)
     from judges
     where extensions.crypt(p_code,code_hash)=code_hash
     limit 1
   ),
   jsonb_build_object('ok',false)
 )
$$;

create or replace function judge_get_works(p_code text) returns jsonb
language plpgsql security definer
set search_path=public,extensions
as $$
declare j uuid; r jsonb;
begin
 select id into j
 from judges
 where extensions.crypt(p_code,code_hash)=code_hash
 limit 1;

 if j is null then raise exception 'unauthorized'; end if;

 select coalesce(
   jsonb_agg(
     jsonb_build_object(
       'id',w.id,
       'code',w.code,
       'name',w.name,
       'manifest',w.manifest,
       'scored',exists(
         select 1 from scores s
         where s.judge_id=j and s.work_id=w.id
       )
     )
     order by w.code
   ),
   '[]'::jsonb
 )
 into r
 from works w;

 return r;
end $$;

create or replace function judge_get_score(p_code text,p_work_id uuid) returns jsonb
language plpgsql security definer
set search_path=public,extensions
as $$
declare j uuid; r jsonb;
begin
 select id into j
 from judges
 where extensions.crypt(p_code,code_hash)=code_hash
 limit 1;

 if j is null then raise exception 'unauthorized'; end if;

 select to_jsonb(s)-'id'-'judge_id'-'work_id'-'updated_at'
 into r
 from scores s
 where judge_id=j and work_id=p_work_id;

 return r;
end $$;

create or replace function judge_submit_score(
  p_code text,
  p_work_id uuid,
  p_score jsonb,
  p_comment text
) returns boolean
language plpgsql security definer
set search_path=public,extensions
as $$
declare j uuid;
begin
 select id into j
 from judges
 where extensions.crypt(p_code,code_hash)=code_hash
 limit 1;

 if j is null then raise exception 'unauthorized'; end if;

 if (p_score->>'c1')::numeric not between 0 and 20
 or (p_score->>'c2')::numeric not between 0 and 25
 or (p_score->>'c3')::numeric not between 0 and 20
 or (p_score->>'c4')::numeric not between 0 and 25
 or (p_score->>'c5')::numeric not between 0 and 10
 then
   raise exception 'score out of range';
 end if;

 insert into scores(judge_id,work_id,c1,c2,c3,c4,c5,comment)
 values(
   j,p_work_id,
   (p_score->>'c1')::numeric,
   (p_score->>'c2')::numeric,
   (p_score->>'c3')::numeric,
   (p_score->>'c4')::numeric,
   (p_score->>'c5')::numeric,
   coalesce(p_comment,'')
 )
 on conflict(judge_id,work_id)
 do update set
   c1=excluded.c1,
   c2=excluded.c2,
   c3=excluded.c3,
   c4=excluded.c4,
   c5=excluded.c5,
   comment=excluded.comment,
   updated_at=now();

 return true;
end $$;

grant execute on function admin_check(text) to anon;
grant execute on function admin_add_judge(text,text,text) to anon;
grant execute on function admin_delete_judge(text,uuid) to anon;
grant execute on function admin_create_work(text,text,text) to anon;
grant execute on function admin_set_manifest(text,uuid,jsonb) to anon;
grant execute on function admin_delete_work(text,uuid) to anon;
grant execute on function admin_dashboard(text) to anon;
grant execute on function judge_login(text) to anon;
grant execute on function judge_get_works(text) to anon;
grant execute on function judge_get_score(text,uuid) to anon;
grant execute on function judge_submit_score(text,uuid,jsonb,text) to anon;

insert into storage.buckets(id,name,public)
values('works','works',false)
on conflict(id) do update set public=false;

drop policy if exists "anon upload works" on storage.objects;
drop policy if exists "anon read works" on storage.objects;
drop policy if exists "anon delete works" on storage.objects;

create policy "anon upload works"
on storage.objects for insert to anon
with check(bucket_id='works');

create policy "anon read works"
on storage.objects for select to anon
using(bucket_id='works');

create policy "anon delete works"
on storage.objects for delete to anon
using(bucket_id='works');

-- 正式使用前修改管理员口令，例如：
-- update app_settings
-- set admin_secret_hash=extensions.crypt('你的新口令',extensions.gen_salt('bf'))
-- where id=1;
