# Supabase 后端部署说明（WIO Tracker）

## 架构总览

```
小程序客户端 ──(anon key 仅过网关)──▶ Edge Functions ──(service_role)──▶ Postgres
                                      wx-login / sync / pay-create / pay-notify
```

- 客户端**零直连数据库**：RLS 全锁，anon key 只能打到 Edge Functions
- 会话 token：`{userId}.{HMAC-SHA256(userId, WIO_SESSION_SECRET)}`，无状态
- 数据同步：本地优先 + JSONB 快照镜像 + `data_version` 乐观锁

## 1. 建表

Supabase Dashboard → SQL Editor → 执行 `schema.sql` 全文。

> 如果之前已执行过旧版 schema，补一列即可：
> ```sql
> alter table public.payment_orders add column if not exists out_trade_no text unique;
> ```

## 2. 安装 CLI 并登录

```bash
npm install -g supabase
supabase login
supabase link --project-ref <你的 project ref>
```

## 3. 配置密钥（secrets）

```bash
# 微信小程序（mp.weixin.qq.com → 开发管理 → 开发设置）
supabase secrets set WX_APPID=wx9e594322f0cef94f
supabase secrets set WX_SECRET=你的AppSecret

# 会话签名密钥（随机生成，勿泄露）
supabase secrets set WIO_SESSION_SECRET=$(openssl rand -hex 32)

# 虚拟支付（开通虚拟支付后，后台「基本配置」里拿）
supabase secrets set VIRTUAL_PAY_OFFER_ID=你的OfferID
supabase secrets set VIRTUAL_PAY_APPKEY=你的现网AppKey
supabase secrets set VIRTUAL_PAY_ITEM_MONTH=月卡道具ID
supabase secrets set VIRTUAL_PAY_ITEM_YEAR=年卡道具ID
```

## 4. 部署函数

```bash
supabase functions deploy wx-login   --no-verify-jwt
supabase functions deploy sync       --no-verify-jwt
supabase functions deploy pay-create --no-verify-jwt
supabase functions deploy pay-notify --no-verify-jwt
```

`--no-verify-jwt`：关闭 Supabase 自带的 JWT 校验（我们的 token 不是
Supabase JWT），鉴权由函数内的 HMAC token 校验完成。

## 5. 微信后台配置

1. **服务器域名**：mp 后台「开发设置 → 服务器域名」，request 合法域名加
   `https://<project-ref>.supabase.co`
2. **支付回调**：虚拟支付 → 支付回调配置，填
   `https://<project-ref>.supabase.co/functions/v1/pay-notify`

## 6. 客户端接入

1. `utils/cloudConfig.js` 填入 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`
2. 完成——`App.vue` 已在 onLaunch 拉取 / onHide 推送，
   `wioService` 的三个 save 方法已挂 markDirty 钩子

## 各模块职责

| 文件 | 职责 |
|---|---|
| `utils/cloudConfig.js` | 云端地址与支付道具配置（占位待填） |
| `utils/auth.js` | 微信登录、会话存取、request 封装 |
| `utils/syncService.js` | 快照打包、防抖推送、拉取恢复、冲突解决 |
| `supabase/functions/wx-login` | code2session + 建/查用户 + 下发 token |
| `supabase/functions/sync` | 快照推/拉 + 乐观锁 + 订阅状态 |
| `supabase/functions/pay-create` | 生成虚拟支付拉起参数（⚠️签名待按文档核验） |
| `supabase/functions/pay-notify` | 支付回调验签入账（⚠️验签待按文档核验） |

## 冲突流程（对应设计稿第 10 屏）

```
push → 409 {conflict, data, data_version}
     → uni.$emit('wio:sync-conflict', {...})
     → UI 弹窗（本机 vs 云端）
     → resolveConflict('local'|'cloud', info)
```

## 已知待办

- [ ] pay-create / pay-notify 的签名算法按官方文档核验（需先开通虚拟支付）
- [ ] ProfileView 接入：账号卡三态 + 授权弹层 + 同步卡（UI 已在 Ardot 08-13 屏）
- [ ] 冲突弹窗组件接入 `wio:sync-conflict` 事件
