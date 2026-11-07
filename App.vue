<script>
	import { initCloud } from './utils/cloud.js'
	import { init as cloudInit, flush as cloudFlush, hasPendingConflict } from './utils/syncService.js'

	// 首次 onShow 紧跟 onLaunch（那里已经 pull 过），避免启动时白拉两次；
	// 之后每次从后台切回都补一次拉取，多设备改的数据才能及时合并进来
	let hasShownOnce = false
	let lastConflictPromptAt = 0

	// 冲突弹窗只在「我的」页 / 会员页监听。在日历页改完历史数据再切回前台，
	// 冲突会一直挂在 pendingConflict 里没人接管，用户只看到「改动没同步上去」。
	// 这里做全局兜底：等页面有机会消费后再探测，仍没人接管就提示去处理。
	function promptConflictIfOrphaned() {
		setTimeout(() => {
			if (!hasPendingConflict()) return
			if (Date.now() - lastConflictPromptAt < 60000) return
			lastConflictPromptAt = Date.now()
			let lang = 'zh-CN'
			try {
				const raw = uni.getStorageSync('wio_settings')
				lang = (raw && JSON.parse(raw).language) || 'zh-CN'
			} catch (e) { /* 读不到就按中文 */ }
			const en = lang === 'en-US'
			uni.showModal({
				title: en ? 'Sync needs your input' : '同步待处理',
				content: en
					? 'Both this device and the cloud have changes. Choose which one to keep, otherwise new edits will not upload.'
					: '本机和云端的数据都改过，需要你选择保留哪一份；不选的话，刚改的记录不会上传。',
				confirmText: en ? 'Resolve' : '去处理',
				cancelText: en ? 'Later' : '稍后',
				success: (r) => {
					if (r.confirm) uni.switchTab({ url: '/pages/profile/index' })
				}
			})
		}, 600)
	}

	export default {
		onLaunch: function() {
			console.log('App Launch')
			uni.hideTabBar()

			// 云开发初始化（仅微信小程序端生效）
			initCloud()

			// 云同步：登录用户启动时拉取云端比对合并（静默，失败不打扰）
			uni.$on('wio:sync-conflict', promptConflictIfOrphaned)
			cloudInit().catch(() => {})

			//#ifdef MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO
			// 检查小程序更新（仅小程序端支持）
			if (typeof uni.getUpdateManager === 'function') {
				const updateManager = uni.getUpdateManager();

				updateManager.onCheckForUpdate(function (res) {
					console.log('Has new version:', res.hasUpdate);
				});

				updateManager.onUpdateReady(function (res) {
					uni.showModal({
						title: '更新提示',
						content: '新版本已经准备好，是否重启应用？',
						showCancel: false,
						success(res) {
							if (res.confirm) {
								updateManager.applyUpdate();
							}
						}
					});
				});

				updateManager.onUpdateFailed(function (res) {
					uni.showModal({
						title: '提示',
						content: '新版本下载失败，请检查网络设置',
						showCancel: false
					});
				});
			}
			//#endif
		},
		onShow: function() {
			console.log('App Show')
			uni.hideTabBar()
			// 从后台切回：云端可能有另一台设备的修改，补一次拉取比对
			if (hasShownOnce) cloudInit().catch(() => {})
			hasShownOnce = true
		},
		onHide: function() {
			console.log('App Hide')
			// 云同步：切后台前把未推送的本地变更推上去
			cloudFlush().catch(() => {})
		}
	}
</script>

<style>
	/*每个页面公共css */
	/* 隐藏 H5 原生 tabBar，改用自定义胶囊 TabBar */
	uni-tabbar,
	.uni-tabbar,
	.uni-app--showtabbar .uni-app__tabbar {
		display: none !important;
	}
</style>
