<script>
	export default {
		onLaunch: function() {
			console.log('App Launch')
			uni.hideTabBar()
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
