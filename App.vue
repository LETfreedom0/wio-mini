<script>
	import { initCloud } from './utils/cloud.js'
	import { init as cloudInit, flush as cloudFlush } from './utils/syncService.js'

	export default {
		onLaunch: function() {
			console.log('App Launch')
			uni.hideTabBar()

			// 云开发初始化（仅微信小程序端生效）
			initCloud()

			// 云同步：登录用户启动时拉取云端比对合并（静默，失败不打扰）
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
