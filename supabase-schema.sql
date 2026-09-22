-- ============================================================
-- LifeOS Supabase 表结构 v2.0（支持用户认证）
-- 在 Supabase Dashboard → SQL Editor 中执行
-- 最后更新：2026-07-29
-- ============================================================

-- ============================================================
-- 第一部分：如果已有 v1 表，先迁移（添加 user_id 列）
-- 如果你是从零开始，可以跳到第二部分直接建表
-- ============================================================

-- 安全添加 user_id 列（如果不存在）
alter table activity_logs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table user_skills add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 为旧数据填充空值（如果有的话，可忽略或手动处理）
-- update activity_logs set user_id = '...' where user_id is null;

-- ============================================================
-- 第二部分：建表（从零开始用这段）
-- ============================================================

-- 1. 活动日志表（打卡记录）
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  skills jsonb default '[]'::jsonb
);

-- 2. 用户技能表（五维人生数据）
create table if not exists user_skills (
  user_id uuid references auth.users(id) on delete cascade,
  skill_id text not null,
  xp int not null default 0,
  level int not null default 1,
  updated_at timestamptz default now(),
  primary key (user_id, skill_id)
);

-- ============================================================
-- 第三部分：RLS 行级安全策略
-- 确保每个用户只能访问自己的数据
-- ============================================================

-- 启用行级安全
alter table activity_logs enable row level security;
alter table user_skills enable row level security;

-- 删除旧的匿名策略（如果存在）
drop policy if exists "anon read logs" on activity_logs;
drop policy if exists "anon read skills" on user_skills;

-- 授权 authenticated 角色基本访问
grant select, insert, update, delete on activity_logs to authenticated;
grant select, insert, update on user_skills to authenticated;

-- activity_logs 策略：用户只能操作自己的记录
create policy "用户读取自己的记录"
  on activity_logs for select
  to authenticated
  using (auth.uid() = user_id);

create policy "用户插入自己的记录"
  on activity_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "用户更新自己的记录"
  on activity_logs for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "用户删除自己的记录"
  on activity_logs for delete
  to authenticated
  using (auth.uid() = user_id);

-- user_skills 策略：用户只能操作自己的技能数据
create policy "用户读取自己的技能"
  on user_skills for select
  to authenticated
  using (auth.uid() = user_id);

create policy "用户插入自己的技能"
  on user_skills for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "用户更新自己的技能"
  on user_skills for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 第四部分（可选）：如果 dashboard.html 仍需匿名读取
-- 可以保留以下匿名只读策略
-- ============================================================

-- grant select on activity_logs to anon;
-- grant select on user_skills to anon;
-- create policy "anon read logs" on activity_logs for select using (true);
-- create policy "anon read skills" on user_skills for select using (true);
