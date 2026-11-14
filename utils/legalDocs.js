// ============================================================
// 协议文本 · 用户协议 / 隐私政策
//
// 为什么单独一个文件：locales.js 是 UI 文案，有中英键名对齐的断言约束；
// 协议是长文、按章节组织，塞进 locales 会让对齐脚本和 diff 都变噪。
//
// 内容口径必须与代码事实一致——写了什么就要真做：
//   - 只收集 openid / 头像 / 昵称 / 打卡与设置 / 订单（云函数实际字段）
//   - 不收集 手机号、位置、通讯录、相册内容、剪贴板、设备标识
//   - 云同步是纯手动，不在后台传输
//   - 云端数据库权限「所有用户不可读写」，只能经云函数按 openid 访问
// 改这些事实时，本文件要同步改。
// ============================================================

export const CONTACT_EMAIL = '1546844202@qq.com'

/** 协议/政策版本日期，内容实质变更时才更新 */
const UPDATED = {
  'zh-CN': '2026 年 11 月 14 日',
  'en-US': 'November 14, 2026'
}

const agreementZh = {
  title: '用户协议',
  updatedLabel: '更新日期：',
  intro: '欢迎使用 WIO Tracker（以下简称「本小程序」）。本协议是你与本小程序开发者之间关于使用本服务的约定，请在使用前阅读。你开始使用本服务，即表示已阅读并同意本协议。',
  sections: [
    {
      h: '一、服务内容',
      p: [
        '本小程序用于记录你每个工作日是否回公司办公（WIO），并统计月度与年度的达标情况，供你个人回顾。',
        '数据默认只保存在你的手机本地。你可以选择登录后手动上传到云端，用于换机或重装后恢复。'
      ]
    },
    {
      h: '二、账号',
      p: [
        '你可以不登录直接使用本地功能。登录通过微信授权完成，我们以微信分配的 openid 作为账号唯一标识，不获取你的手机号、通讯录或位置信息。',
        '你可以随时在「我的」页退出登录。退出后本地数据会被清除，云端数据仍然保留，直到你申请删除。'
      ]
    },
    {
      h: '三、你的数据',
      p: [
        '打卡记录与设置属于你。我们仅为提供服务而存储这些数据，不用于广告投放或用户画像，不向任何第三方出售或共享。',
        '你可以在小程序内修改或删除记录。如需删除云端数据或注销账号，请通过本页底部的联系方式提出，我们会在 15 个工作日内处理。',
        '数据默认只保存在你的手机本地。更换手机、卸载或重装小程序、清理微信存储空间、恢复出厂设置、主动退出登录，都会清除本地数据，未上传到云端的内容将无法找回。请在换机、重装或清理前，先到「我的」页使用「上传到云端」。',
        '因你自行进行上述操作，或因你所用设备的系统故障、丢失、损坏，导致尚未上传云端的数据丢失，我们不承担赔偿责任；法律强制规定不得免除的责任除外。'
      ]
    },
    {
      h: '四、会员与付费',
      p: [
        'WIO PRO 为一次性付费订阅：月卡 30 天，年卡 366 天，到期不自动续费，需要你主动再次购买。价格以下单页面展示为准。',
        '会员权益以「会员」页列出的功能为准，可能随版本更新调整；你已购买的有效期内权益不受影响。',
        '本服务销售的是虚拟商品，一经开通不支持退款。iOS 端的交易款项由 Apple 收取与结算，相关退款规则由 Apple 制定，我们无权代为处理。',
        '会员收费与广告收入用于覆盖云存储、平台认证与日常维护等运营成本。'
      ]
    },
    {
      h: '五、服务变更与中断',
      p: [
        '我们可能因功能升级、维护或不可抗力暂停服务，并尽量提前在页面内说明。因网络、微信平台或云服务故障造成的短时不可用，我们不承担赔偿责任，但会尽力恢复。',
        '本服务由个人开发者独立维护，云端存储、流量与平台认证均产生持续成本。若未来因成本、平台政策或开发者个人原因无法继续运营，我们可能停止提供云端同步，甚至整体下线本小程序。届时会提前不少于 30 天在小程序内公告，并留出不少于 30 天的数据导出期，供你把需要的内容保存到本机或另存他处。',
        '服务终止后云端数据将被删除，我们不再保留副本。因服务终止造成的数据丢失，我们不承担赔偿责任；如你已购买会员且服务期未满，就因我们终止服务而无法继续提供的部分，按剩余天数比例退还相应费用。'
      ]
    },
    {
      h: '六、使用规范',
      p: [
        '你不得利用本小程序从事违法活动，不得尝试破解、批量注册、干扰服务运行或抓取他人数据。',
        '本小程序的名称、界面、代码、文案与图标等内容的知识产权归开发者所有。未经许可，不得复制、反编译、二次分发或用于商业用途；对侵权行为，我们将依法追究责任。'
      ]
    },
    {
      h: '七、免责',
      p: [
        '本小程序是个人记录工具，统计结果仅供参考，不构成考勤凭证、劳动仲裁依据或用人单位的人事认定。请以你所在单位的正式考勤记录为准。'
      ]
    },
    {
      h: '八、协议更新',
      p: [
        '本协议更新后会在本页展示并标注日期。更新后继续使用视为接受新版本；如不同意，你可以停止使用并申请删除数据。'
      ]
    },
    {
      h: '九、联系方式',
      p: [
        '如对本协议有疑问，可通过本页底部邮箱联系我们。'
      ]
    }
  ]
}

const agreementEn = {
  title: 'Terms of Service',
  updatedLabel: 'Last updated: ',
  intro: 'Welcome to WIO Tracker ("the App"). These terms set out the agreement between you and the developer of the App. By using the App, you confirm that you have read and accept these terms.',
  sections: [
    {
      h: '1. What the App does',
      p: [
        'The App helps you record whether you worked from the office (WIO) on each workday and shows monthly and yearly completion rates for your own review.',
        'Your data is stored on your device by default. If you sign in, you may upload it to the cloud manually so it can be restored after switching phones or reinstalling.'
      ]
    },
    {
      h: '2. Account',
      p: [
        'You can use all local features without signing in. Signing in uses WeChat authorization; we identify your account solely by the openid issued by WeChat. We do not obtain your phone number, contacts or location.',
        'You can sign out at any time from the Profile page. Signing out clears local data; cloud data is retained until you ask us to delete it.'
      ]
    },
    {
      h: '3. Your data',
      p: [
        'Your records and settings belong to you. We store them only to provide the service, never for advertising or profiling, and never sell or share them with third parties.',
        'You can edit or delete records in the App. To delete cloud data or close your account, contact us using the email at the bottom of this page; we handle such requests within 15 business days.',
        'Your data is stored on your device by default. Switching to a new phone, uninstalling or reinstalling the App, clearing WeChat storage, factory resetting the device, or signing out all erase local data, and anything not uploaded to the cloud cannot be recovered. Before switching phones, reinstalling or clearing storage, use "Upload to cloud" on the Profile page.',
        'We are not liable for the loss of data that was not yet uploaded to the cloud where the loss results from you carrying out the actions above, or from a fault, loss or damage of your device, except to the extent liability cannot be excluded by law.'
      ]
    },
    {
      h: '4. Membership and payment',
      p: [
        'WIO PRO is a one-time paid subscription: 30 days for the monthly plan and 366 days for the yearly plan. It does not renew automatically; you need to purchase again yourself. Prices are those shown on the purchase screen.',
        'The benefits are those listed on the Membership page and may change with app updates; benefits you have already paid for remain valid until they expire.',
        'The App sells digital goods. Once activated, purchases are non-refundable. For purchases made on iOS, the payment is collected and settled by Apple; relevant refund policies are set by Apple, and we are not able to process refunds on your behalf.',
        'Membership fees and ad revenue exist to cover the operating costs of cloud storage, platform verification and day-to-day maintenance.'
      ]
    },
    {
      h: '5. Changes and interruptions',
      p: [
        'We may suspend the service for upgrades, maintenance or reasons beyond our control, and will try to give notice in the App beforehand. We are not liable for short outages caused by network, WeChat platform or cloud service failures, but we will work to restore service.',
        'The App is maintained by an individual developer, and cloud storage, traffic and platform verification carry ongoing costs. If we can no longer keep it running because of cost, platform policy or the developer\u2019s personal circumstances, we may stop providing cloud sync or take the App offline entirely. In that case we will post a notice in the App at least 30 days in advance and leave a data export window of at least 30 days so you can save what you need on your own device or elsewhere.',
        'When the service ends, cloud data is deleted and we keep no copy. We are not liable for data loss caused by the termination; if you have purchased a membership that has not yet expired, the unused portion is refunded on a pro-rata basis for the days remaining.'
      ]
    },
    {
      h: '6. Acceptable use',
      p: [
        'You must not use the App for unlawful purposes, attempt to crack it, register accounts in bulk, interfere with its operation, or scrape other users\u2019 data.',
        'The App\u2019s name, interface, code, copy and icons are the intellectual property of the developer. You may not copy, decompile, redistribute or use them for commercial purposes without permission; we reserve the right to pursue legal action against infringement.'
      ]
    },
    {
      h: '7. Disclaimer',
      p: [
        'The App is a personal tracking tool. Its statistics are for reference only and do not constitute attendance records, evidence for labour disputes, or any determination by your employer. Please rely on your employer\u2019s official attendance records.'
      ]
    },
    {
      h: '8. Updates to these terms',
      p: [
        'Updated terms are shown on this page with a revised date. Continued use after an update means you accept the new version; if you do not agree, you may stop using the App and request deletion of your data.'
      ]
    },
    {
      h: '9. Contact',
      p: [
        'If you have questions about these terms, contact us at the email at the bottom of this page.'
      ]
    }
  ]
}

const privacyZh = {
  title: '隐私政策',
  updatedLabel: '更新日期：',
  intro: '本说明介绍 WIO Tracker 如何处理你的个人信息。我们只收集运行所必需的最少信息，不将你的数据用于广告投放，不接入第三方统计或用户画像 SDK。',
  sections: [
    {
      h: '一、我们收集什么',
      p: [
        '微信账号标识（openid）：在你登录时由微信云函数获取，用于区分不同用户，把你的记录存在你自己的账号下。',
        '头像与昵称：仅在你主动登录时由你选择或填写，用于在账号卡上显示。',
        '打卡与设置数据：日期、出勤状态、加班时长、目标天数、假期配置、语言与分享卡面偏好。',
        '会员与订单信息：订阅计划、到期时间、订单号、支付流水号、支付金额。我们不接触也不存储你的银行卡号、支付密码或验证码。'
      ]
    },
    {
      h: '二、我们不收集什么',
      p: [
        '手机号、位置、通讯录、相册内容（保存分享图只是「写入相册」，不读取你的照片）、剪贴板、设备标识符（IMEI / IDFA / Android ID）。',
        '判断功能可用性时会读取微信版本、系统平台与基础库版本，这类信息只在本机使用，不会上传服务器。'
      ]
    },
    {
      h: '三、数据存放在哪里',
      p: [
        '本地：保存在你手机的本地存储中，卸载小程序或退出登录即清除。',
        '云端：仅在你主动点击「上传到云端」后写入腾讯云开发（CloudBase，服务器位于中国上海），用于换机恢复。同步是手动触发的，不会在你不知情时于后台传输。'
      ]
    },
    {
      h: '四、第三方',
      p: [
        '微信支付（虚拟支付）：你购买会员时，微信会处理支付所需的信息，适用微信自身的隐私政策。',
        '微信广告：本小程序可能展示由微信广告服务提供的广告。广告的展示与效果衡量所涉及的信息处理，适用微信自身的隐私政策。',
        '除此之外，我们不与任何第三方共享你的个人信息，也未接入统计分析或社交登录类 SDK。'
      ]
    },
    {
      h: '五、保存期限',
      p: [
        '数据在你的账号存续期间保存。你可以随时申请删除云端数据或注销账号，我们会在 15 个工作日内删除，法律法规另有要求的除外。'
      ]
    },
    {
      h: '六、你的权利',
      p: [
        '你可以在小程序内查看、修改、删除自己的记录，也可以退出登录清除本地数据。',
        '如需查阅、更正或删除全部数据，或注销账号，可通过本页底部邮箱提出。我们不会因为你行使这些权利而拒绝提供服务。'
      ]
    },
    {
      h: '七、未成年人',
      p: [
        '本服务不面向 14 周岁以下的儿童。若你未满 14 周岁，请在监护人陪同下使用。'
      ]
    },
    {
      h: '八、安全',
      p: [
        '数据经微信云开发链路传输。云端数据库的访问权限设为「所有用户不可读写」，只能由云函数按 openid 访问本人数据。请妥善保管你的微信账号，它是访问这些数据的唯一凭证。'
      ]
    },
    {
      h: '九、变更与联系',
      p: [
        '本说明更新后会在本页展示并标注日期。本说明与我们在微信平台登记的《小程序用户隐私保护指引》保持一致。',
        '如有疑问或需要行使上述权利，请通过本页底部邮箱联系我们。'
      ]
    }
  ]
}

const privacyEn = {
  title: 'Privacy Policy',
  updatedLabel: 'Last updated: ',
  intro: 'This policy explains how WIO Tracker handles your personal information. We collect only the minimum needed to run the App, do not use your data for advertising, and integrate no third-party analytics or profiling SDKs.',
  sections: [
    {
      h: '1. What we collect',
      p: [
        'WeChat account identifier (openid): obtained by our cloud function when you sign in, used to separate users and store your records under your own account.',
        'Avatar and nickname: chosen or entered by you, only when you sign in, and shown on your account card.',
        'Records and settings: dates, attendance status, overtime hours, target days, holiday settings, language and share-card style preferences.',
        'Membership and order data: plan, expiry date, order number, transaction ID and amount paid. We never receive or store your card number, payment password or verification codes.'
      ]
    },
    {
      h: '2. What we do not collect',
      p: [
        'Phone number, location, contacts, photo library contents (saving a share image only writes to your album and does not read your photos), clipboard, or device identifiers such as IMEI / IDFA / Android ID.',
        'We read the WeChat version, platform and base library version to decide whether a feature is available. This information is used only on your device and is never uploaded.'
      ]
    },
    {
      h: '3. Where data is stored',
      p: [
        'On device: in local storage. Uninstalling the App or signing out clears it.',
        'In the cloud: only after you tap "Upload to cloud", data is written to Tencent CloudBase (servers in Shanghai, China) for restoring on a new device. Sync is triggered manually and never runs in the background without your knowledge.'
      ]
    },
    {
      h: '4. Third parties',
      p: [
        'WeChat Pay (virtual payment): when you buy a membership, WeChat processes the payment information under its own privacy policy.',
        'WeChat Ads: the App may display ads served by WeChat\u2019s advertising service. Information processing involved in ad display and performance measurement is subject to WeChat\u2019s own privacy policy.',
        'Otherwise we share no personal information with third parties, and the App integrates no analytics or social-login SDKs.'
      ]
    },
    {
      h: '5. Retention',
      p: [
        'Data is kept while your account exists. You may request deletion of cloud data or closure of your account at any time; we delete it within 15 business days, unless the law requires otherwise.'
      ]
    },
    {
      h: '6. Your rights',
      p: [
        'You can view, edit and delete your records in the App, and clear local data by signing out.',
        'To access, correct or delete all data, or to close your account, contact us at the email at the bottom of this page. We will not deny you service for exercising these rights.'
      ]
    },
    {
      h: '7. Children',
      p: [
        'The App is not intended for children under 14. If you are under 14, please use it with the guidance of a guardian.'
      ]
    },
    {
      h: '8. Security',
      p: [
        'Data travels over the WeChat CloudBase link. Cloud database access is set to "not readable or writable by any user"; only cloud functions can access your own data by openid. Please protect your WeChat account, as it is the only credential for this data.'
      ]
    },
    {
      h: '9. Changes and contact',
      p: [
        'Updates to this policy are shown on this page with a revised date. This policy is consistent with the Mini Program Privacy Protection Guidelines we filed on the WeChat platform.',
        'For questions or to exercise the rights above, contact us at the email at the bottom of this page.'
      ]
    }
  ]
}

export const LEGAL_DOCS = {
  agreement: {
    'zh-CN': Object.assign({}, agreementZh, { updated: UPDATED['zh-CN'] }),
    'en-US': Object.assign({}, agreementEn, { updated: UPDATED['en-US'] })
  },
  privacy: {
    'zh-CN': Object.assign({}, privacyZh, { updated: UPDATED['zh-CN'] }),
    'en-US': Object.assign({}, privacyEn, { updated: UPDATED['en-US'] })
  }
}

/** 页面底部与「我的」页共用的少量标签 */
export const LEGAL_LABELS = {
  'zh-CN': {
    contactTitle: '联系方式',
    tapToCopy: '点击复制邮箱',
    copied: '邮箱已复制',
    openWechatPolicy: '查看微信登记的隐私保护指引',
    missing: '内容暂不可用'
  },
  'en-US': {
    contactTitle: 'Contact',
    tapToCopy: 'Tap to copy email',
    copied: 'Email copied',
    openWechatPolicy: 'View the privacy guidelines filed with WeChat',
    missing: 'Content unavailable'
  }
}

/**
 * @param {'agreement'|'privacy'} type
 * @param {string} lang
 */
export function getLegalDoc(type, lang) {
  const doc = LEGAL_DOCS[type] || LEGAL_DOCS.agreement
  return doc[lang] || doc['zh-CN']
}

export function getLegalLabels(lang) {
  return LEGAL_LABELS[lang] || LEGAL_LABELS['zh-CN']
}
