-- ============================================================
-- WIO Tracker · Supabase 建表脚本 v1
-- 在 Supabase Dashboard → SQL Editor 中整体执行一次即可
-- 访问模型：客户端【不】直连数据库，所有读写经 Edge Function
-- （service role），因此 RLS 全部开启且不放行任何客户端策略
-- ============================================================

-- ---------- 1. 用户表 ----------
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  openid      text unique not null,            -- 微信 openid，登录主键
  unionid     text,                            -- 有开放平台时补充
  nickname    text,                            -- 微信昵称（nickname 输入框收集，随快照同步）
  avatar_url  text,                            -- Storage 公开 URL；换设备登录后自动恢复头像
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- 2. 用户数据快照表（同步核心） ----------
-- data 列存放整个本地数据的 JSONB 快照，不做明细拆表：
-- 结构示例：
-- {
--   "version": 1,
--   "entries": { "2026-10-25": { "status": "company", "ot": 1.5 } },
--   "settings": { "target": 40, "annualTotal": 10, "annualUsed": 5,
--                 "sickTotal": 5, "sickUsed": 2, "birthdayEnabled": true,
--                 "birthdayMonth": 12, "language": "zh-CN", ... },
--   "meta": { "savedAt": "2026-10-25T09:50:00+08:00", "appVersion": "1.1.0" }
-- }
create table if not exists public.user_data (
  user_id            uuid primary key references public.users(id) on delete cascade,
  data               jsonb not null default '{}'::jsonb,
  data_version       bigint not null default 0,          -- 服务端递增版本号，防乱序覆盖
  client_updated_at  timestamptz,                        -- 客户端声明的最后修改时间（冲突判定依据）
  updated_at         timestamptz not null default now()
);

-- ---------- 3. 订阅表（PRO 会员） ----------
-- 只允许 Edge Function（支付回调/查询）写入，客户端只读校验结果
create table if not exists public.subscriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  plan              text not null check (plan in ('month', 'year')),
  status            text not null default 'active'
                      check (status in ('active', 'expired', 'refunded')),
  wx_transaction_id text unique,                         -- 虚拟支付订单号，防重复入账
  started_at        timestamptz not null default now(),
  expires_at        timestamptz not null,                -- 到期时间；月卡+31天/年卡+366天
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_sub_user
  on public.subscriptions (user_id, status, expires_at desc);

-- ---------- 4. 支付订单流水（对账 + 验签留痕） ----------
create table if not exists public.payment_orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  plan              text not null check (plan in ('month', 'year')),
  amount_fen        int  not null,                       -- 金额（分）
  status            text not null default 'pending'
                      check (status in ('pending', 'paid', 'failed', 'refunded')),
  offer_id          text,                                -- 虚拟支付 OfferID
  out_trade_no      text unique,                         -- 商户订单号（pay-create 生成）
  wx_env            int,                                 -- 0=现网 1=沙箱
  wx_transaction_id text unique,
  raw_payload       jsonb,                               -- 微信回调原文，方便排查
  created_at        timestamptz not null default now(),
  paid_at           timestamptz
);

-- ---------- 5. RLS：全部锁死，客户端零直连 ----------
alter table public.users          enable row level security;
alter table public.user_data      enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.payment_orders enable row level security;
-- 不创建任何 policy：匿名/客户端 key 一律拒绝，
-- 仅 Edge Function 持 service_role key 可读写。

-- ---------- 6. 头像存储桶 ----------
-- 头像流程：chooseAvatar 临时文件 → 压缩(~100KB) → base64 传 Edge Function
--          → service_role 写入本桶 → 返回公开 URL 存 users.avatar_url
-- 公开读（头像非敏感），路径含 user_id（uuid 不可枚举）天然隔离
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- ---------- 7. （可选）兑换码表，过渡期备用 ----------
create table if not exists public.redeem_codes (
  code      text primary key,
  plan      text not null check (plan in ('month', 'year')),
  status    text not null default 'unused'
              check (status in ('unused', 'used', 'disabled')),
  used_by   uuid references public.users(id),
  used_at   timestamptz,
  note      text,
  created_at timestamptz not null default now()
);
