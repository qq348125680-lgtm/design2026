
-- 作品80分 + 说明文档20分 + 三评委排名版：升级 SQL
-- 可在现有 Supabase 项目中直接运行，不删除现有作品。

alter table public.scores
add column if not exists deduction numeric not null default 0;

alter table public.scores
add column if not exists doc_score numeric not null default 0;

create or replace function public.judge_get_score(p_code text,p_work_id uuid) returns jsonb
language plpgsql security definer
set search_path=public,extensions
as $$
declare j uuid; r jsonb;
begin
  select id into j from judges
  where extensions.crypt(p_code,code_hash)=code_hash limit 1;
  if j is null then raise exception 'unauthorized'; end if;

  select jsonb_build_object(
    'c1',s.c1,'c2',s.c2,'c3',s.c3,'c4',s.c4,
    'doc_score',coalesce(s.doc_score,0),
    'deduction',coalesce(s.deduction,0),
    'comment',coalesce(s.comment,'')
  )
  into r from scores s
  where judge_id=j and work_id=p_work_id;
  return r;
end $$;

create or replace function public.judge_submit_score(
  p_code text,p_work_id uuid,p_score jsonb,p_comment text
) returns boolean
language plpgsql security definer
set search_path=public,extensions
as $$
declare j uuid; d numeric; ds numeric;
begin
  select id into j from judges
  where extensions.crypt(p_code,code_hash)=code_hash limit 1;
  if j is null then raise exception 'unauthorized'; end if;

  d:=coalesce((p_score->>'deduction')::numeric,0);
  ds:=coalesce((p_score->>'doc_score')::numeric,0);

  if (p_score->>'c1')::numeric not between 0 and 24
  or (p_score->>'c2')::numeric not between 0 and 20
  or (p_score->>'c3')::numeric not between 0 and 20
  or (p_score->>'c4')::numeric not between 0 and 16
  or ds not between 0 and 20
  or d not between 0 and 100
  then raise exception 'score out of range'; end if;

  insert into scores(judge_id,work_id,c1,c2,c3,c4,c5,doc_score,deduction,comment)
  values(
    j,p_work_id,
    (p_score->>'c1')::numeric,(p_score->>'c2')::numeric,
    (p_score->>'c3')::numeric,(p_score->>'c4')::numeric,
    0,ds,d,coalesce(p_comment,'')
  )
  on conflict(judge_id,work_id)
  do update set
    c1=excluded.c1,c2=excluded.c2,c3=excluded.c3,c4=excluded.c4,c5=0,
    doc_score=excluded.doc_score,deduction=excluded.deduction,
    comment=excluded.comment,updated_at=now();
  return true;
end $$;

create or replace function public.admin_dashboard(p_secret text) returns jsonb
language plpgsql security definer
set search_path=public,extensions
as $$
declare r jsonb;
begin
  if not admin_ok(p_secret) then raise exception 'unauthorized'; end if;

  with base as (
    select
      w.id,w.code,w.name,w.manifest,
      count(s.id)::int as judged_count,
      round(avg(greatest(
        0,
        s.c1+s.c2+s.c3+s.c4+coalesce(s.doc_score,0)-coalesce(s.deduction,0)
      )),2) as avg_score
    from works w
    left join scores s on s.work_id=w.id
    group by w.id,w.code,w.name,w.manifest
  ),
  ranked as (
    select b.*,
      case when judged_count>=3
        then dense_rank() over(
          order by case when judged_count>=3 then avg_score else null end desc nulls last, code asc
        )
        else null
      end as rank
    from base b
  )
  select jsonb_build_object(
    'works',coalesce((select jsonb_agg(to_jsonb(w) order by w.code) from works w),'[]'::jsonb),
    'judges',coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code_plain) order by created_at)
      from judges
    ),'[]'::jsonb),
    'score_count',(select count(*) from scores),
    'summary',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code',rnk.code,
          'judged_count',rnk.judged_count,
          'avg_score',rnk.avg_score,
          'rank',rnk.rank,
          'judge_scores',
            coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'judge_name',j.name,
                  'c1',s.c1,'c2',s.c2,'c3',s.c3,'c4',s.c4,
                  'work_score',(s.c1+s.c2+s.c3+s.c4),
                  'doc_score',coalesce(s.doc_score,0),
                  'deduction',coalesce(s.deduction,0),
                  'final_score',greatest(0,s.c1+s.c2+s.c3+s.c4+coalesce(s.doc_score,0)-coalesce(s.deduction,0)),
                  'comment',coalesce(s.comment,'')
                ) order by j.created_at
              )
              from scores s join judges j on j.id=s.judge_id
              where s.work_id=rnk.id
            ),'[]'::jsonb)
        )
        order by case when rnk.rank is null then 999999 else rnk.rank end, rnk.code
      ) from ranked rnk
    ),'[]'::jsonb)
  ) into r;
  return r;
end $$;

grant execute on function public.judge_get_score(text,uuid) to anon;
grant execute on function public.judge_submit_score(text,uuid,jsonb,text) to anon;
grant execute on function public.admin_dashboard(text) to anon;
