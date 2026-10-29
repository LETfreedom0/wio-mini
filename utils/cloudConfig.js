// ============================================================
// 云端配置 · 微信云开发（CloudBase）
//
// 使用前只需填一个 CLOUDBASE_ENV：
// 微信开发者工具 → 云开发控制台 → 环境 ID（形如 wio-xxxxx）
// ============================================================

export const CLOUD = {
  // 云开发环境 ID（开通云开发后创建）
  CLOUDBASE_ENV: 'prod-d1glr7pbd4f1ab2f5',

  // 虚拟支付（开通后从「虚拟支付 → 基本配置」获取）
  // 注意：这些只是记录用途。前端不参与签名——
  // OfferID / AppKey / 道具 ID / AppSecret 全部由云函数 pay 读取环境变量使用，
  // AppKey 与 AppSecret 属于密钥，任何时候都不能写进前端代码。
  OFFER_ID: '1450683826',
  PAY_MONTH_ITEM_ID: '',
  PAY_YEAR_ITEM_ID: ''
}
