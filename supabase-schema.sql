-- LifeOS Supabase 表结构（在 SQL Editor 中执行）

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  created_at timestamptz not null default now(),
  skills jsonb default '[]'::jsonb
);

create table if not exists user_skills (
  skill_id text primary key,
  xp int not null default 0,
  level int not null default 1,
  updated_at timestamptz default now()
);

-- 演示用：允许匿名读取（生产环境请按用户鉴权收紧 RLS）
alter table activity_logs enable row level security;
alter table user_skills enable row level security;

create policy "anon read logs" on activity_logs for select using (true);
create policy "anon read skills" on user_skills for select using (true);

-- 若主应用也要写入 Supabase，可额外添加 insert/update 策略
