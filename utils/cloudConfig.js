// ============================================================
// 云端配置 · 占位符版本
// 拿到 Supabase 项目后填入 URL / ANON_KEY 即可
// Edge Function 部署后无需改动（服务端密钥走环境变量）
// ============================================================

export const CLOUD = {
  // Supabase Dashboard → Settings → API
  SUPABASE_URL: 'https://YOUR-PROJECT-ref.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',

  // Edge Functions（supabase functions deploy 自动挂在项目域名下）
  EDGE: {
    login: '/functions/v1/wx-login',
    sync: '/functions/v1/sync',
    payCreate: '/functions/v1/pay-create',
    payNotify: '/functions/v1/pay-notify'
  },

  // 微信小程序虚拟支付（后台「虚拟支付 → 基本配置」里拿）
  // 客户端拉起支付时要用；签名由 pay-create 服务端完成
  OFFER_ID: 'YOUR_OFFER_ID',
  PAY_MODE: 0, // 0=道具直购
  PAY_MONTH_ITEM_ID: 'YOUR_MONTH_ITEM_ID', // 道具管理里的月卡道具 ID
  PAY_YEAR_ITEM_ID: 'YOUR_YEAR_ITEM_ID'    // 道具管理里的年卡道具 ID
}
