<script>
	import { initCloud } from './utils/cloud.js'
	import { checkRemote } from './utils/syncService.js'
	import { isLogin, purgeLegacyStorage } from './utils/auth.js'
	import { isProUser } from './utils/pro.js'

	// 同步是纯手动动作：启动时只做一次「只读检查」——问云端有没有更新，
	// 有就在会员页的同步卡上亮个红点，绝不改动本地数据。
	// onShow / onHide 不再触发任何同步，避免后台悄悄改数据。
	function checkCloudOnce() {
		setTimeout(() => {
			try {
				if (!isLogin() || !isProUser()) return
			} catch (e) {
				return
			}
			checkRemote().catch(() => {})
		}, 1500)
	}

	export default {
		onLaunch: function() {
			console.log('App Launch')
			uni.hideTabBar()

			// 清掉 2.0.0 之前本地兑换码通道留下的权益残留（已不再生效）
			purgeLegacyStorage()

			// 云开发初始化（仅微信小程序端生效）
			initCloud()

			// 只读检查云端是否有更新（不发任何写入）
			checkCloudOnce()

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
			// 不做任何同步：数据只由用户在会员页手动上传 / 恢复
		},
		onHide: function() {
			console.log('App Hide')
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
