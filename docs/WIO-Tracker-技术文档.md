# WIO Tracker 微信小程序 · 技术文档

**版本** v2.0.0 ｜ **更新** 2026-11-08 ｜ **形态** 个人主体微信小程序（uni-app + 微信云开发）

---

## 0. 项目定位

一款记录「每周到公司 / 居家 / 休假」并换算成 **WIO（Work In Office）达标率**的小工具。面向有混合办公制度的公司员工：打卡要 3 秒完成，月度要能一眼看出达标与否，数据要能带走。

核心设计取舍是 **本地优先（local-first）**：所有读写都发生在 `localStorage`，云端只承担两件事——可选的跨设备备份、会员权益校验。断网、退出登录、清空云端，都不影响核心功能。

| 项            | 值                                                       |
| ------------ | ------------------------------------------------------- |
| 小程序 AppID    | `wx9e594322f0cef94f`                                    |
| 云开发环境        | `prod-d1glr7pbd4f1ab2f5`（ap-shanghai）                   |
| 虚拟支付 OfferID | `1450683826`                                            |
| 技术栈          | uni-app 3.x（Vue 3）+ Vite 5 + 微信云开发（云函数 / 云数据库）          |
| 后端形态         | Serverless，7 个云函数，前端不直连数据库                              |
| 代码量          | 约 1.8 万行（页面 3 989 / 组件 7 464 / utils 5 267 / 云函数 1 285） |
| 规模           | 8 个页面、8 个组件、23 个 utils、7 个云函数、8 张集合                     |
| 提交           | 145 次（2026-01-18 起）                                     |
| 变现           | 微信虚拟支付（月卡 ¥6 / 年卡 ¥48）+ 兑换码                             |



---

## 1. 项目结构

```
wio-mini/
├── App.vue                    # 启动：云开发初始化、残留存储清理、只读云端探测
├── main.js / manifest.json / pages.json / vite.config.js
├── pages/                     # 页面层（8 个，含协议页与订单页）
│   ├── index/index.vue        # 首页：本周打卡、月度达标率、年进度
│   ├── calendar/index.vue     # 日历：月视图标记、批量操作、福利假
│   ├── profile/index.vue      # 我的：账号、目标、假期额度、设置
│   ├── member/index.vue       # 会员（二级页，非 tab）：权益、同步、付费
│   ├── stats/index.vue        # 统计：月度/年度对比、图表
│   ├── share/index.vue        # 分享卡生成：双卡面轮播、保存相册
│   ├── legal/index.vue        # 用户协议 / 隐私政策（?type=）
│   └── orders/index.vue       # 会员与订单（会员详情 + 交易记录；微信「订单中心」登记的 path）
├── components/                # 组件层（8 个）
│   ├── CustomTabBar.vue       # 自绘 3 格 tabBar
│   ├── CustomHeader.vue       # 自定义导航栏（安全区适配）
│   ├── HomeView.vue / MemberView.vue / ProfileView.vue
│   ├── PaywallSheet.vue       # 付费墙（会员页与我的页共用）
│   ├── CustomLeaveSheet.vue   # 自定义假期编辑
│   └── RedeemSheet.vue        # 兑换码（隐藏入口）
├── utils/                     # 服务层（21 个）
│   ├── wioService.js          # 数据核心：读写、口径、统计、假期规则（最大单文件）
│   ├── syncService.js         # 三向合并同步
│   ├── pro.js                 # PRO 权益判定唯一口径
│   ├── auth.js                # 登录、订阅镜像、兑换、头像上传
│   ├── pay.js                 # 虚拟支付前端拉起
│   ├── shareCard.js / cardPaint.js / cardStyleCalendar.js / cardStyleReceipt.js
│   ├── holidays.js / holidays2027.js   # 法定节假日与调休数据
│   ├── locales.js             # 中英双语文案（428 键 × 2 语言）
│   ├── cloud.js / cloudConfig.js       # 云函数调用封装
│   └── haptic.js / secretTap.js / safeArea.js / appVersion.js …
├── cloudfunctions/            # 云函数（7 个，独立部署）
│   ├── login/  pay/  paysweep/  xpaynotify/  sync/  redeem/  wxacode/
├── docs/  static/  supabase/（早期方案存档，未启用）
└── .workbuddy/shared-check/   # 离线断言脚本（13 套 + 1 渲染器）
```

**分层约定**

| 层              | 职责             | 铁律                                    |
| -------------- | -------------- | ------------------------------------- |
| pages          | 路由、生命周期、页面装配   | 不写业务计算                                |
| components     | 视图与交互          | 不直接读写 storage                         |
| utils          | 数据、口径、同步、权益、绘制 | 唯一可信来源，可被断言直接加载                       |
| cloudfunctions | 鉴权、写库、支付、发权益   | 前端不直连数据库，openid 只从 `getWXContext()` 取 |

---

## 2. 功能地图

| 页面      | 核心能力                                               |
| ------- | -------------------------------------------------- |
| **首页**  | 本周打卡（公司/居家/休假一键标记）、月度达标率环、年进度、每日一句                 |
| **日历**  | 月视图着色、单日/区间标记、半天（上午/下午）、自定义假（区间型与按天型）、法定节假日与调休自动识别 |
| **我的**  | 微信登录（头像昵称）、月度目标、年假/病假额度、生日假、公共假期安排（逐日休/班、按年切换）、语言切换、版本号          |
| **会员**  | PRO 权益展示、云同步（上传/恢复）、付费墙（月卡/年卡）、兑换码（隐藏入口）           |
| **统计**  | 月度/年度出勤构成、居家天数、节约通勤时间                              |
| **分享卡** | 750×1000 战绩卡，日历风 / 小票风双卡面左右滑动，带小程序码，保存相册           |

**主链路**：打卡 → 日历着色 → 首页达标率 → 统计/分享卡 → 需要备份或更多权益时进会员页。

---

## 3. 数据设计

### 3.1 本地存储（7 个键 + 1 个待清理）

| Key                  | 内容                          | 说明                  |
| -------------------- | --------------------------- | ------------------- |
| `wio_settings`       | 目标、额度、语言、假期配置               | 单个 JSON 对象          |
| `wio_entries`        | 出勤记录 `{ 'YYYY-MM-DD': 状态 }` | 核心数据                |
| `wio_overtime`       | 加班记录 `{ 'YYYY-MM-DD': 小时 }` |                     |
| `wio_auth`           | 会话 `{ user, subscription }` | 云端状态的本地镜像           |
| `wio_sync_base`      | 上次同步成功时的三份快照                | 三向合并基线，**只在本机，不上传** |
| `wio_sync_state`     | 同步状态、红点、上次同步时间              |                     |
| `wio_restore_backup` | 恢复前备份                       | 支持撤销恢复              |
| ~~`wio_pro_trial`~~  | 旧本地兑换码通道                    | v2.0.0 起废弃，启动时清理    |

### 3.2 出勤记录模型

`entries[dateStr]` 支持两种形态：

|   |   |   |   |   |   |   |   |
| - | - | - | - | - | - | - | - |

- **字符串**：`'company' | 'home' | 'vacation' | 'birthday' | 'sick' | 'unpaid' | 'comp_off' | 'exclude_wio'`，也可为 `'custom:<leaveId>'`（按天型自定义假）
- **对象**：`{ am, pm }`，用于上下午不同状态（上午公司 + 下午育儿假）

规整约定：`am === pm` 时一律存字符串——体积最小，且老版本客户端读到字符串不会白屏。

**折算口径**（业务核心，改动需谨慎）：

| 类型          | 计入达标率分母                       | 备注         |
| ----------- | ----------------------------- | ---------- |
| 公司          | 是，且计入分子                       |            |
| 居家          | 是                             | 拿不到分       |
| 半天出勤        | 依 `halfFullDays` 开关：0.5 或 1 天 | 标记时当场确认    |
| 半天居家 / 半天假期 | 恒定 0.5 天                      | 保证开关只影响达标率 |
| 法定放假日（`isOffDay:true`） | 否                     | 上面标了显式状态 = 公司这天上班，按工作日算（`isOffDayOverride`） |
| 调休补班日（`isOffDay:false`） | 是（默认）               | 与「公共假期安排」灰格=上班一致；老配置显式 `false` 才按休息 |

|                                                                                 |      |                                                                           |
| ------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------- |
| **按天型自定义假独立存 `settings.customMarks`**：\`{ 'YYYY-MM-DD': { leaveId, part: 'full' | 'am' | 'pm' } }`。绝不塞进 `entries`——`entries`是固定状态枚举，塞进去会污染出勤判断；两者并存时`entries\` 优先。 |

### 3.3 设置项（`wio_settings`）

`username`、`targetPercentage`(40)、`vacationDays`(20)、`sickDays`(12)、`language`('zh-CN')、`birthdayEnabled/birthdayMonth`、`halfDayAttendance`('half')、`halfFullDays{}`、`commuteMinutes`(90)、`cardStyle`('calendar')、`holidayPlan{}`（公共假期安排差量，按日期键，随 settings 云同步）、`compOffRules{春节:true}`（仅老数据兼容）、`customLeaves[]`、`customMarks{}`。

### 3.4 云端集合（8 张）

| 集合               | 主键约定              | 主要字段                                                                                         | 用途              |
| ---------------- | ----------------- | -------------------------------------------------------------------------------------------- | --------------- |
| `users`          | 自增                | `openid, nickname, avatarFileID, created_at, updated_at`                                     | 用户资料            |
| `user_data`      | 自增（openid 唯一）     | `openid, data, data_version, client_updated_at, updated_at`                                  | 数据快照（整包）        |
| `subscriptions`  | 自增                | `openid, plan, status, expires_at, wx_order_id, wx_transaction_id, out_trade_no, started_at` | 权益唯一来源          |
| `payment_orders` | 自增                | `openid, plan, product_id, amount_fen, status, out_trade_no, created_at, paid_at`            | 订单台账            |
| `redeem_codes`   | 自增                | `code, days, max_uses, used_count, enabled, expires_at, note`                                | 码表              |
| `redeem_logs`    | **`openid_code`** | `openid, code, days, expires_at, created_at`                                                 | 核销日志            |
| `trial_grants`   | **`openid`**      | `openid, days, expires_at, created_at`                                                       | 体验发放记录          |
| `sys_cache`      | 固定键               | token 缓存                                                                                     | access_token 复用 |

**两个「靠主键唯一实现业务约束」的设计**（不用事务、不依赖分布式锁）：

- `redeem_logs._id = openid + '_' + code` → 同一人同一码只能核销一次，主键冲突即失败
- `trial_grants._id = openid` → 一人只能领一次体验，且**不要求 `users` 表存在**，老用户也能补领

### 3.5 订阅模型

`plan` 取值：`month`(30 天) / `year`(366 天) / `trial`(7 天) / `code`(兑换码天数)。

**顺延规则**：以现有最长有效期为基准累加，不覆盖：

```
base = 现有有效订阅的 expires_at ?? Date.now()
expiresAt = base + plan 天数 × 86400000
```

所有发权益入口（支付、兑换码、体验）写的是**同一张 `subscriptions` 表、同一套顺延规则**，所以会员页不需要区分「买的」还是「兑的」。

> ⚠️ 这套集合上残留一个历史唯一索引 `wx_transaction_id`，空值只允许存在一条。因此三种发权益路径都必须写入唯一值（平台单号 / `redeem:<code>:<openid>` / `trial:<openid>`），否则「第二次购买必然写库失败」。

---

## 4. 云函数

| 函数           | 触发             | 入参                                    | 依赖集合                                     | 环境变量                                                                                  |
| ------------ | -------------- | ------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `login`      | 前端调用           | `nickname, avatarFileID, claimTrial`  | users, subscriptions, trial_grants       | —                                                                                     |
| `sync`       | 前端调用           | `action: pull\|push` + 快照             | user_data, subscriptions                 | —                                                                                     |
| `pay`        | 前端调用 / 函数间调用   | `action: create\|query\|verify\|orders\|refund\|refundinfo\|diag` | payment_orders, subscriptions, sys_cache | `VIRTUAL_PAY_APPKEY` `WX_APP_SECRET` `VIRTUAL_PAY_ITEM_MONTH` `VIRTUAL_PAY_ITEM_YEAR` |
| `xpaynotify` | 微信发货推送（公网 URL） | XML                                   | 经 `pay` 间接                               | —                                                                                     |
| `paysweep`   | **定时器，每 5 分钟** | —                                     | payment_orders                           | —                                                                                     |
| `redeem`     | 前端调用           | `action: redeem\|issue`               | redeem_codes, redeem_logs, subscriptions | `REDEEM_ADMIN_TOKEN`                                                                  |
| `wxacode`    | 前端调用           | `scene, page`                         | sys_cache                                | `WX_APP_SECRET`                                                                       |

### 4.1 `login`

微信登录入口。`getWXContext()` 取 openid（**不需要 AppSecret**）→ 建/更新 `users`（昵称截断 40 字、头像 fileID 截断 512 字，防超长串污染快照）→ 可选发放 7 天体验 → 返回用户资料 + 有效订阅。

`claimTrial` 只在**用户主动登录**时携带，静默刷新不带，避免每次进会员页都多查两张表。

### 4.2 `sync`

整包快照推拉 + 乐观锁。`push` 时比较 `base_version` 与云端 `data_version`：相等则接受并 +1；落后且非 `force` 返回冲突；`force` 强制覆盖。

三处防御：快照 5MB 上限；`data` 字段用 `_.set()` 整体替换（见 5.2）；同一 openid 若存在重复文档，按版本倒序取主文档并顺手清理。

### 4.3 `pay`

微信小程序**虚拟支付 · 道具直购**（个人主体可用）。`create` 用 `wx.login` 的 code 换 session_key → 生成 `outTradeNo` → 写 pending 订单 → 拼 `signData` → 算两个签名返回前端拉起支付。`query` / `verify` 一律向平台 `POST /xpay/query_order` 核实。`diag` 为部署自检，**存在 openid 时直接拒绝**。

### 4.4 `xpaynotify`

接收微信「发货推送」。核心判断：**推送只是通知，不是发货依据**——谁拿到 `outTradeNo` 都能伪造一条推送，因此这里不直接写库，而是回调 `pay` 去平台查单，确认已支付才入账。必须回 `<ErrCode>0</ErrCode>`，否则平台重试 15 次，故入账必须幂等。

### 4.5 `paysweep`

定时兜底。扫 `payment_orders` 中停留超过 1 分钟的 pending 订单，逐个查单补发货，超过 24 小时未支付标记 expired。存在理由：前端 `success` 回调会丢（用户付完直接杀微信），推送也可能丢——没有这一层就是「钱付了、会员没到」。

### 4.6 `redeem`

服务端核销。`redeem`：验码 → 原子占额 → 记日志（主键唯一）→ 写 `subscriptions`。`issue`：批量发码，需 `REDEEM_ADMIN_TOKEN`，不配则自动关闭。

入口不在付费墙，改为**版本号连点 5 次**唤起 `RedeemSheet`（`utils/secretTap.js`，间隔 >1.2s 重新计数）。

### 4.7 `wxacode`

生成分享卡上的小程序码（`getUnlimited`，scene 为 `YYYYMM`）。不用 `cloud.openapi.wxacode`——云开发托管 token 在该环境恒为 invalid，改为自行用 `stable_token` 换取的 token 直接请求 HTTP 接口。

---

## 5. 关键技术实现

### 5.1 三向合并同步（`syncService.js`）

服务端只存**整包**，冲突解决全部放在客户端，靠本机基线 `wio_sync_base` 做三向比对（base / local / cloud）：

| 情形               | 结果                            |
| ---------------- | ----------------------------- |
| 本机有              | 本机赢，纳入上传                      |
| 基线有 + 本机删        | 尊重删除，云端也要删                    |
| 云端独有             | 补下来                           |
| 基线有 + 云端删 + 本机未改 | 补回云端（`cloudDeleted`，必须在确认层列出） |

**日期边界**：云端只存 `<= 今天` 的数据。未来的标记是「计划」不是「事实」，不参与同步。`historyData()` 是唯一裁剪口径，必须同时用于四处——推送载荷、基线、三边比对、条数统计；少一处就会出现「云端已删除、将补回」的假差异。

**恢复语义**：历史取云端、计划取本机（`mergeRestore(historyData(cloud), futureOnly(local))`）。

**关键顺序**：`uploadMerge` 必须「先 push 成功、再写基线」，否则推送失败会留下半合并中间态。

### 5.2 CloudBase `update` 是「合并」不是「替换」

这是最隐蔽的一个坑。CloudBase 对**对象类型字段**的 `update` 是按键合并，与 MongoDB 语义不同：payload 里没出现的旧键会被保留 → 用户删掉的记录同步后又回来了，表现为「删除成功、过一会又回来」。

解决：`data: _.set(snapshot)` 强制整体替换。

### 5.3 虚拟支付签名链路

```
signData = JSON.stringify({ offerId, buyQuantity, env, currencyType,
                            productId, goodsPrice, outTradeNo, attach })
paySig    = HMAC-SHA256(AppKey,      'requestVirtualPayment&' + signData)   // 证明是小程序发的
signature = HMAC-SHA256(sessionKey, signData)                              // 证明是这个人发的
```

三个必须守住的细节：**键顺序固定**（同一个字符串同时参与两个签名）、**signData 用驼峰键**、**AppKey / AppSecret 只放云函数环境变量**。

`access_token` 统一走 `stable_token` 接口——普通 `cgi-bin/token` 会被其它调用方刷新顶掉，导致查单报 `invalid credential`，用户付了钱却发不出货。

### 5.4 幂等发货三层兜底

1. 前端支付成功回调 → `pay.query`
2. 微信发货推送 → `xpaynotify` → 转 `pay.verify`
3. 定时器 `paysweep` 每 5 分钟扫 pending 单

三层都以「向平台查单」为准，入账以平台单号做幂等键，重复通知不重复发货。

### 5.5 兑换码原子占额

旧写法「先查 `used_count` 是否还有余量，再写库」在并发下会超发：两人同时核销同一个单次码，都读到 0，都发权益。改为带条件的原子自增：

```js
where({ _id, used_count: _.lt(maxUses) }).update({ data: { used_count: _.inc(1) } })
```

只有真正把计数推进去的那次才算抢到名额；本人重复核销、入账失败都要 `inc(-1)` 退回。

|                                    |   |                               |   |                                                                            |
| ---------------------------------- | - | ----------------------------- | - | -------------------------------------------------------------------------- |
| 同时修了一个隐蔽 bug：\`Number(doc.max_uses |   | 1)`——`max_uses = 0`表示不限次数，但`0 |   | 1 === 1`，导致「不限次数的活动码」实际只能被领一次。改 `doc.max_uses == null ? 1 : Number(...)\`。 |

### 5.6 首次登录发放体验

`trial_grants._id = openid` 靠主键唯一天然实现一人一次，不依赖 `users` 表存在（老用户可补领）。判重顺序：**先查发放记录、再查有效订阅**——反过来的话，试用期内重复点击会返回「已是会员」，提示语误导用户。入账失败必须回滚占位，否则该用户永久失去资格。

### 5.7 PRO 权益判定：单一口径

`utils/pro.js` 的 `isProUser() / getProState()` 是唯一入口，任何组件不得自己写 `isPro`。此前三处各写一份 + 读组件内 `session` 快照，出现过「头像显示会员·体验中、会员页却是 locked」。

配套三条：

- **事件广播**：`wio:pro-changed`（登录/退出/兑换/订阅更新时发出），组件监听到后触发 `computed` 重算
- **时间戳归一**：`toTimestamp()` 兼容数字 / 毫秒字符串 / ISO / Date——云数据库 date 经云函数序列化成字符串后，`expiresAt > Date.now()` 会得 `NaN`
- **权益落到数据层**：无 PRO 时 `getSettings()` 语言降级、`getCustomLeaves()` 返回空、`saveCustomLeave()` 拒写。只做 UI 隐藏会变成「退出登录后还能用」


### 5.8 节假日口径：单点裁决 + 逐日差量

三个概念别混：

| 概念 | 存在哪 | 谁说了算 |
| --- | --- | --- |
| 官方原始安排 | `holidays.js` / `holidays2026.js` / `holidays2027.js`，`{date, name, isOffDay}` | 代码内置，逐年补 |
| 公司实际安排 | `settings.holidayPlan = { 'YYYY-MM-DD': 'off' \| 'work' }`，**只存与官方不同的天** | 用户「我的 → 公共假期安排」逐日点选（可按年切换） |
| 某天的临时标记 | `entries[date]` | 日历上手标 |

**裁决只有一个入口**：`getPublicHoliday(dateStr)` 先查原始安排、再套差量，命中时返回 `{ ...raw, isOffDay: 生效值, overridden: true }`。所有消费方（`isOfficialWorkingDay`、日历上色、月/年统计、首页倒计时）都拿裁决后的 `isOffDay`，**不要自己查 `holidayPlan`**。

口径（2026-11-13 统一）：

- **放假日（`isOffDay: true`）** → 不算工作日，不进分母。这天标了显式出勤/休假 = 用户声明「公司这天上班」（`isOffDayOverride`），按工作日统计
- **补班日（`isOffDay: false`）** → **默认算工作日**，与「假期安排」灰格 = 上班一致。`compOffRules` 只剩老数据兼容：显式 `false` 的节日才按休息处理
- **差量优先于一切**：命中 `holiday.overridden` 即终审，不再走 `compOffRules`

**为什么只存差量**：官方安排逐年更新，存全量会被旧配置钉死；存差量换年自动跟新，点回默认值即删条目。

**逐日编辑器（我的页「公共假期安排」）**：

- 年份切换：`getHolidayYears()` 取内置数据覆盖的年份，默认今年；`getHolidayInfoList(year)` / `getHolidayPlanDays(name, year)` / `getHolidayPlanChangedCount(name, year)` / `resetHolidayPlan(name, year)` **全部带年份**，跨年配置互不影响
- 条带每条带 `makeup`（原始安排是补班日）与 `isOff`（裁决后是否休）：`makeup && !isOff` 时**第三行「星期」直接换成「补」**（角标会压住日期，占一行更好认；红=休、金=改过，所以「补」用中性深灰），改成休就恢复显示星期
- 卡头副行 `.plan-hint-row`：左边说这张卡影响什么（月/年统计与分享卡），右边说这一年改过几天（0 天显示「按官方安排」）；年份 pill 右上角小金点 = 那年改过，不用点开就知道
- 数据进云：`holidayPlan` 是**配置不是事实**，不进 `DATE_MAPS`（不按今天裁剪，否则明年的安排永远同步不上去）；合并走 `mergeKeyed` 按日期三向，差异清单报一条「公共假期安排」

**两个必踩的坑**：

1. `isOfficialWorkingDay` 里差量改成的「上班日」会掉进 `compOffRules` 分支被拦回——必须先判 `holiday.overridden`
2. 条带 / 已调整天数 / 重置都必须按年份过滤，否则 2026 / 2027 同名节日混进同一条日历带、重置还会连带清掉另一年

**日历渲染**：`getDayClass` 只按**裁决后的 `isOffDay`** 分流——休 = 公共假期粉底，上班 = `holiday-work` 灰底；节日名只在**官方原始放假日**上写（`showHolidayLabel` 看 `rawIsOffDay`），补班日（哪怕在安排里改成休）不写名字，要上班的只挂右上角「班」徽章。

### 5.9 Canvas 分享卡

750×1000 双卡面：`cardPaint.js`（公共原语）+ `cardStyleCalendar.js` / `cardStyleReceipt.js` + `shareCardArt.js`（分发层）。

**基线问题**（真机上才发现）：`textBaseline = 'middle'` 在微信 canvas 有约 0.12em 的平台偏移，iOS / Android / 开发者工具各不相同，大字号必然歪。改为 `alphabetic` + `baseline = top + 0.73 × 字号`——capHeight 在各平台稳定在 0.72–0.75em，误差收敛到 4px 内。离线 SVG 校验看不出这个问题，`dominant-baseline="central"` 与 canvas `middle` 语义不同。

卡面切换用真 `swiper` + `previous-margin / next-margin` 露出邻卡边缘（90rpx），让「可以滑动」这件事被看见，而不是靠文字提示。

### 5.10 中英双语

`utils/locales.js` 单文件 428 键 × 2 语言，运行时按 `wio_settings.language` 取值。断言脚本会校验中英键数一致，防止漏译。

### 5.11 离线断言体系

`.workbuddy/shared-check/` 下 17 套断言 + 1 个 SVG 渲染器，合计 1200 余条校验点，全部直接加载**真实业务源码**（不复制实现），用假 `uni` 对象 / 假 `wx-server-sdk` / 内存假库驱动：

| 脚本 | 覆盖 |
|---|---|
| `sync-flow.mjs`（154） | 三向合并、日期边界、删除传播、冲突 |
| `customleave.mjs`（133） | 自定义假区间/按天、半天、额度扣减 |
| `palette.mjs`（280）/ `palette-vm.mjs`（97） | 色板取值与视图模型 |
| `halfday.mjs`（98） | 半天口径迁移对比（基线每次从 git 重新生成） |
| `compat.mjs`（53） | v1 → v2 升级兼容：旧实现写、新代码读 |
| `stats-chart.mjs`（51） | 统计口径与图表数据 |
| `holiday-plan.mjs`（64） | 公共假期安排差量、补班日口径与「补」标识、按年条带/重置 |
| `wio-consistency.mjs`（43） | 数据层与视图层口径一致 |
| `redeem.mjs`（30） | 核销、并发抢码、名额回滚、不限次 |
| `refund.mjs`（28）/ `refundnotify.mjs`（20） | 退款与退款推送 |
| `holiday-override.mjs`（26） | 放假日上的显式标记 = 覆盖 |
| `trial.mjs`（22） | 体验发放、判重顺序、回滚 |
| `orders.mjs`（19）/ `home-labels.mjs`（19） | 订单列表口径、首页标签 |
| `check.mjs` | 分享卡 2 样式 × 2 语言 × 6 场景绘制校验 |
| `render.mjs` | 把 canvas 调用录制成 SVG，离线看版式 |

这套东西的价值在于：小程序没有单测环境，而这些脚本能在**不打开开发者工具**的情况下拦住回归。

---

## 6. 工程与运维

### 6.1 构建

```bash
UNI_INPUT_DIR=. npx uni build -p mp-weixin
```

必须带 `UNI_INPUT_DIR=.`，否则 CLI 会去找 `src/manifest.json` 报 ENOENT。

### 6.2 云函数部署

```bash
tcb fn code update <name>     # ✅ 只更新代码，不动配置与环境变量
tcb fn deploy <name> --force  # ⚠️ 会套用 cloudbaserc.json 的 envVariables
```

**为什么默认用 `code update`**：`cloudbaserc.json` 里写的是 `"VIRTUAL_PAY_APPKEY": "{{env.VIRTUAL_PAY_APPKEY}}"`，占位符只在进程环境存在同名变量时才解析，而 tcb 不读 `.env.local`。用 `deploy` 会把这些占位符写成空串，**直接覆盖控制台已配好的密钥 → 支付失效**。

**部署验证三段式**：

1. `tcb fn detail` — 看 `Status = Deployment completed`、Code size、环境变量是否与部署前一致
2. `tcb fn code download` 下载云端代码 `diff` 本地源码 — 逐字节一致才算部署正确
3. `tcb fn invoke` 冒烟 — 期望返回业务侧的 `no_openid`，证明依赖已加载、运行时正常

> 注意：不要用 `{"action":"diag"}` 冒烟 `pay`——CLI 调用没有 OPENID，会真的去拉 `stable_token`。

### 6.3 环境变量（只在云函数侧）

| 变量 | 用途 | 所在函数 |
|---|---|---|
| `VIRTUAL_PAY_APPKEY` | 支付请求签名 | pay |
| `WX_APP_SECRET` | 换 session_key / access_token | pay, wxacode |
| `VIRTUAL_PAY_ITEM_MONTH/YEAR` | 道具 ProductId | pay |
| `REDEEM_ADMIN_TOKEN` | 发码口令 | redeem |

### 6.4 定时触发器

`paysweep`：`0 */5 * * * * *`（每 5 分钟）。`tcb fn deploy` 不创建触发器，需单独确认控制台存在。

### 6.5 上线检查清单

- [ ] 8 张集合权限全部设为**「所有用户不可读写」**（前端不直连 DB；但任何一张「所有用户可读」都会泄露全量数据）
- [ ] MP 后台隐私保护指引声明「用户信息（头像、昵称）」「相册（仅写入）」——**不配置则 `chooseAvatar`、`saveImageToPhotosAlbum` 真机直接失败**，比审核更早暴露
- [ ] 协议页可点（登录弹层、付费墙、我的页三处入口）；隐私政策优先走 `wx.openPrivacyContract()` 打开平台登记版本，失败退回自建页
- [ ] `paysweep` 定时触发器存在
- [ ] **订单中心 path 已登记为 `pages/orders/index`**（MP 后台 → 设置 → 基本设置/服务内容声明）。交易类小程序不登记，代码提审会被驳回；path 只能填主路径，不能带 `?参数`
- [ ] `pay` 云函数已重新部署（新增 `action: orders` 供订单页取数；`payment_orders` 权限为「所有用户不可读写」，客户端读不到，必须经它）
- [ ] 云函数环境变量齐全（缺任一，支付返回 `not_configured`）
- [ ] 版本号 `versionCode` 只升不降

---

## 7. 踩坑清单

| 坑 | 现象 | 根因与解法 |
|---|---|---|
| CloudBase `update` 是合并 | 删除记录同步后又回来 | 对象字段要用 `_.set()` 整体替换 |
| `textBaseline='middle'` 有平台偏移 | 大数字与标签顶部差 38px | 改 `alphabetic` + cap 0.73 |
| `0 \|\| 1 === 1` | 不限次数的码只能领一次 | `max_uses == null ? 1 : Number()` |
| 残留唯一索引 | 第二次购买必失败 | 每条记录都写唯一 `wx_transaction_id` |
| 普通 `cgi-bin/token` | 查单报 invalid credential、付钱不发货 | 统一用 `stable_token` |
| 云函数序列化 date | 有订阅却判为非会员 | `toTimestamp()` 归一化 |
| `hideLoading` 后紧跟原生弹层 | 提示被吞 | 延迟一帧再弹 |
| `Object.keys(Set)` | 恒为 `[]`，假期配置传不上云 | 改用标记对象去重 |
| 同步「先写基线再推送」 | 推送失败留半合并中间态 | 先 push 成功、再写基线 |
| 前端码表 | 解包即见、清缓存可重复领 | 码表入数据库，核销在服务端 |

---

## 8. 项目经历表述（可直接用于简历）

> **WIO Tracker · 微信小程序（独立开发，v2.0.0 已上线）**
> 面向混合办公人群的到岗率记录工具，uni-app + 微信云开发 Serverless 架构，约 1.8 万行代码、145 次提交，累计 4 700+ 用户、日活约 100。
>
> - **架构**：本地优先数据模型，全部读写走 `localStorage`，云端仅做备份与权益；后端 7 个云函数，前端零直连数据库，越权面收敛到函数内。
> - **同步**：设计并实现基于本机基线的三向合并算法（base/local/cloud），用「云端只存历史、未来计划不上云」的日期边界消除假差异；定位并修复 CloudBase 对象字段 `update` 为合并语义导致的删除失效问题。
> - **支付**：独立完成微信小程序虚拟支付（个人主体）接入——双签名（AppKey `paySig` + session_key `signature`）、`stable_token` 统一取 token、发货幂等 + 推送校验 + 定时轮询三层兜底，解决「付了钱不到账」类线上问题。
> - **工程**：搭建 11 套离线断言脚本（800+ 校验点）直接加载业务源码，在小程序无单测环境的前提下覆盖同步、权益、兑换并发、绘制等核心路径；沉淀云函数「只更代码不覆盖密钥」的部署流程与三段式验证规范。
> - **增长**：基于 2.1% 的日活/总用户比判断应优先做留存而非拉新，落地「首次登录送 7 天 PRO」服务端发放（主键唯一保证一人一次、失败回滚），替代邀请奖励方案。

---

*文档随代码演进，最近更新：v2.0.0 封版（2026-11-08）。*
