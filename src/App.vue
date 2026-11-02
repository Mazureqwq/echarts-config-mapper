<template>
  <div class="app-shell">
    <NavBar v-if="route.meta.nav !== false" />
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import NavBar from "@/components/ui/NavBar.vue";

// meta.nav=false 的全屏页（设计器/运行态）不显示顶部导航
const route = useRoute();
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.app-main {
  flex: 1 1 auto;
  min-height: 0;
}
</style>