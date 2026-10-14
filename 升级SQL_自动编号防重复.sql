-- 自动编号防重复升级 SQL
-- 运行一次即可，不会删除已有作品和成绩。

create or replace function public.admin_create_work_auto(
  p_secret text,
  p_prefix text,
  p_name text
) returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_id uuid;
  v_code text;
  v_next int;
  v_prefix text;
begin
  if not admin_ok(p_secret) then
    raise exception 'unauthorized';
  end if;

  v_prefix := upper(trim(p_prefix));
  if v_prefix not in ('X','Z') then
    raise exception 'invalid prefix';
  end if;

  -- 每个组别加事务锁，避免同时上传时抢到相同编号
  perform pg_advisory_xact_lock(hashtext('work_code_' || v_prefix));

  select coalesce(
    max(
      case
        when code ~ ('^' || v_prefix || '[0-9]+$')
        then substring(code from 2)::int
        else null
      end
    ),0
  ) + 1
  into v_next
  from public.works
  where code like v_prefix || '%';

  loop
    v_code := v_prefix || lpad(v_next::text,2,'0');
    begin
      insert into public.works(code,name)
      values(v_code,coalesce(nullif(trim(p_name),''),'匿名作品'))
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_next := v_next + 1;
    end;
  end loop;

  return jsonb_build_object('id',v_id,'code',v_code);
end;
$$;

grant execute on function public.admin_create_work_auto(text,text,text) to anon;

-- 可选：检查之前失败上传可能留下的空记录
-- select id,code,name,manifest,created_at
-- from public.works
-- where coalesce(jsonb_array_length(manifest),0)=0
-- order by code;

-- 确认这些空记录确实没用后，再执行：
-- delete from public.works
-- where coalesce(jsonb_array_length(manifest),0)=0;
