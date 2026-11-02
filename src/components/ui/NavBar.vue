<template>
  <nav class="nav-bar">
    <div class="brand">
      <span class="brand-dot" />
      <span class="brand-name">ChartForge</span>
      <span class="brand-sub">大屏基座</span>
    </div>
    <div class="links">
      <router-link to="/library" class="nav-link">图表库</router-link>
      <router-link to="/editor" class="nav-link">图表制作</router-link>
      <router-link to="/screens" class="nav-link">大屏列表</router-link>
    </div>
  </nav>
</template>

<script setup lang="ts">
// 顶部导航壳：三项入口，高亮由 router-link-active 样式处理
</script>

<style scoped>
.nav-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  height: var(--cf-header-h);
  flex: 0 0 auto;
  padding: 0 20px;
  background: var(--cf-bg-1);
  border-bottom: 1px solid var(--cf-border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--cf-accent);
}

.brand-name {
  color: var(--cf-text);
  font-size: 14px;
}

.brand-sub {
  color: var(--cf-text-faint);
  font-size: 12px;
}

.links {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-link {
  padding: 6px 14px;
  border-radius: var(--cf-radius-sm);
  color: var(--cf-text-dim);
  text-decoration: none;
  font-size: 13px;
  transition: background var(--cf-fast), color var(--cf-fast);
}

.nav-link:hover {
  color: var(--cf-text);
  background: var(--cf-bg-hover);
}

.nav-link.router-link-active {
  color: var(--cf-text);
  background: var(--cf-accent-soft);
}
</style>
