<script>
	export default {
		onLaunch: function() {
			console.log('App Launch')
			uni.hideTabBar()
			
			// 检查小程序更新
			const updateManager = uni.getUpdateManager();

			updateManager.onCheckForUpdate(function (res) {
				// 请求完新版本信息的回调
				console.log('Has new version:', res.hasUpdate);
			});

			updateManager.onUpdateReady(function (res) {
				uni.showModal({
					title: '更新提示',
					content: '新版本已经准备好，是否重启应用？',
					showCancel: false, // 强制更新，不显示取消按钮
					success(res) {
						if (res.confirm) {
							// 新的版本已经下载好，调用 applyUpdate 应用新版本并重启
							updateManager.applyUpdate();
						}
					}
				});
			});

			updateManager.onUpdateFailed(function (res) {
				// 新的版本下载失败
				uni.showModal({
					title: '提示',
					content: '新版本下载失败，请检查网络设置',
					showCancel: false
				});
			});
		},
		onShow: function() {
			console.log('App Show')
			uni.hideTabBar()
		},
		onHide: function() {
			console.log('App Hide')
		}
	}
</script>

<style>
	/*每个页面公共css */
</style>
