// ============================================================
// 云端配置 · 占位符版本
// 拿到 Supabase 项目后填入 URL / ANON_KEY 即可
// Edge Function 部署后无需改动（服务端密钥走环境变量）
// ============================================================

export const CLOUD = {
  // Supabase Dashboard → Settings → API
  SUPABASE_URL: 'https://bpjtkzahmgbryojutivg.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanRremFobWdicnlvanV0aXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4ODI2NzUsImV4cCI6MjEwODQ1ODY3NX0.ja0OrjDAcWcy8pZgQdyUfgxg9ENJ-esRG-5KQGvPzAM',

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
