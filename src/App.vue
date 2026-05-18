<template>
  <div v-if="$route.path === '/login'" class="login-wrapper">
    <router-view />
  </div>
  <el-container v-else class="main-container">
    <el-aside width="220px" class="sidebar">
      <div class="logo">餐厅收银系统</div>
      <el-menu
        :default-active="$route.path"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
      >
        <el-menu-item index="/">
          <el-icon><Monitor /></el-icon>
          <span>POS收银</span>
        </el-menu-item>
        <el-menu-item index="/menu">
          <el-icon><KnifeFork /></el-icon>
          <span>菜品管理</span>
        </el-menu-item>
        <el-menu-item index="/orders">
          <el-icon><Document /></el-icon>
          <span>订单历史</span>
        </el-menu-item>
        <el-menu-item index="/reports">
          <el-icon><DataAnalysis /></el-icon>
          <span>销售报表</span>
        </el-menu-item>
      </el-menu>
      <div class="sidebar-footer">
        <span>管理员</span>
        <el-button type="danger" size="small" @click="logout" link>退出</el-button>
      </div>
    </el-aside>
    <el-main class="main-content">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function logout() {
  localStorage.removeItem('isLoggedIn')
  router.push('/login')
}
</script>

<style scoped>
.login-wrapper {
  height: 100%;
}
.main-container {
  height: 100%;
}
.sidebar {
  background-color: #304156;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.sidebar .el-menu {
  border-right: none;
  flex: 1;
}
.sidebar-footer {
  padding: 12px 20px;
  color: #bfcbd9;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.main-content {
  background: #f0f2f5;
  overflow: auto;
}
</style>
