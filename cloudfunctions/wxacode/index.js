// ============================================================
// 云函数: wxacode
// 生成分享卡用的小程序码（getUnlimited，带 scene 参数）
//
// 入参: { scene: 'YYYYMM', page: 'pages/index/index' }
// 出参: { ok: true, image: '<base64 png>' }
//
// 为什么不用 cloud.openapi.wxacode.getUnlimited：
//   云开发托管的 access_token 在这套环境里一直是 invalid（与支付那边同一个坑），
//   所以这里自己走 stable_token 拿 token，再直接请求 HTTP 接口。
//
// 环境变量：WX_APP_SECRET（小程序 AppSecret）
// ============================================================

const https = require('https')

const APPID = 'wx9e594322f0cef94f'
const APP_SECRET = process.env.WX_APP_SECRET || ''

const TOKEN_INVALID = [40001, 40014, 42001]
let memToken = { token: '', exp: 0 }

function request(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const payload = body ? Buffer.from(body) : null
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        payload ? { 'Content-Length': payload.length } : {}
      )
    }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        contentType: res.headers['content-type'] || '',
        buffer: Buffer.concat(chunks)
      }))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

// stable_token：同一 appid 反复调用返回同一个 token，不会把别处刷掉
async function getToken(forceRefresh) {
  if (!forceRefresh && memToken.token && Date.now() < memToken.exp) return memToken.token

  const body = JSON.stringify({
    grant_type: 'client_credential',
    appid: APPID,
    secret: APP_SECRET,
    force_refresh: !!forceRefresh
  })
  const res = await request('POST', 'https://api.weixin.qq.com/cgi-bin/stable_token', body)
  const json = JSON.parse(res.buffer.toString('utf8'))
  if (!json.access_token) throw new Error('access_token 获取失败: ' + JSON.stringify(json))
  memToken = { token: json.access_token, exp: Date.now() + ((json.expires_in || 7200) - 300) * 1000 }
  return memToken.token
}

async function generate(scene, page, forceRefresh) {
  const token = await getToken(forceRefresh)
  const body = JSON.stringify({
    scene,
    page,
    width: 430,
    // 开发期页面路径校验会直接失败，关掉才能出码
    check_path: false,
    env_version: 'release',
    is_hyaline: false,
    line_color: { r: 14, g: 110, b: 98 }
  })
  return request('POST', `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${token}`, body)
}

exports.main = async (event = {}) => {
  const scene = String(event.scene || '').slice(0, 32)
  const page = event.page || 'pages/index/index'

  if (!APP_SECRET) {
    return { ok: false, code: 'missing_secret', message: '缺少环境变量 WX_APP_SECRET' }
  }

  try {
    let res = await generate(scene, page, false)
    let text = res.contentType.indexOf('image') === -1 ? res.buffer.toString('utf8') : ''
    let json = text ? JSON.parse(text) : null

    // token 被别处刷新：强刷一次再试
    if (json && TOKEN_INVALID.indexOf(Number(json.errcode)) >= 0) {
      res = await generate(scene, page, true)
      text = res.contentType.indexOf('image') === -1 ? res.buffer.toString('utf8') : ''
      json = text ? JSON.parse(text) : null
    }

    if (json) {
      return { ok: false, code: json.errcode || 'wxacode_failed', message: json.errmsg || 'gen failed' }
    }
    return { ok: true, image: res.buffer.toString('base64'), size: res.buffer.length }
  } catch (e) {
    console.error('wxacode failed', e)
    return { ok: false, code: 'exception', message: String(e && e.message || e) }
  }
}
