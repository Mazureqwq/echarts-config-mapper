<script setup lang="ts">
import { RouterLink } from "vue-router";
import Icon from "@/shared/ui/Icon.vue";

type Section = "charts" | "screens" | "settings";

withDefaults(defineProps<{ active: Section }>(), { active: "charts" });
</script>

<template>
  <header class="app-header">
    <h1 class="app-header__brand"><Icon name="chart" :size="20" /> <span>ChartForge 图表工作台</span></h1>

    <nav class="app-header__nav" aria-label="主导航">
      <RouterLink to="/charts" class="app-header__link" :class="{ active: active === 'charts' }" :aria-current="active === 'charts' ? 'page' : undefined">图表库</RouterLink>
      <RouterLink to="/screens" class="app-header__link" :class="{ active: active === 'screens' }" :aria-current="active === 'screens' ? 'page' : undefined">大屏库</RouterLink>
      <RouterLink to="/settings" class="app-header__link" :class="{ active: active === 'settings' }" :aria-current="active === 'settings' ? 'page' : undefined">接口设置</RouterLink>
    </nav>

    <div class="app-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.app-header {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 20px;
  width: 100%;
  height: 68px;
  min-height: 68px;
  flex: 0 0 68px;
  padding: 0 24px;
  background: var(--cf-panel);
  border-bottom: 1px solid var(--cf-border);
}

.app-header__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0;
  color: var(--cf-text);
  font-size: 18px;
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
}

.app-header__brand :deep(svg) {
  flex: 0 0 auto;
  color: var(--cf-primary);
}

.app-header__nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  white-space: nowrap;
}

.app-header__link {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--cf-border);
  border-radius: 8px;
  background: transparent;
  color: var(--cf-text-2);
  font-size: 13px;
  line-height: 1;
  text-decoration: none;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.app-header__link:hover {
  background: color-mix(in srgb, var(--cf-primary) 7%, transparent);
  color: var(--cf-text);
}

.app-header__link.active {
  border-color: color-mix(in srgb, var(--cf-primary) 52%, var(--cf-border));
  background: color-mix(in srgb, var(--cf-primary) 12%, transparent);
  color: var(--cf-primary);
  font-weight: 600;
}

.app-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  justify-self: stretch;
  min-width: 0;
  height: 38px;
  overflow: visible;
}

@media (max-width: 900px) {
  .app-header {
    gap: 12px;
    padding-inline: 16px;
  }

  .app-header__brand {
    font-size: 15px;
  }

  .app-header__link {
    padding-inline: 10px;
  }
}

@media (max-width: 680px) {
  /* Keep the same 68px height at every viewport width; only compress the contents. */
  .app-header {
    gap: 8px;
    padding-inline: 10px;
  }

  .app-header__brand span {
    display: none;
  }

  .app-header__nav {
    gap: 3px;
  }

  .app-header__link {
    padding-inline: 7px;
    font-size: 12px;
  }

  .app-header__actions {
    overflow-x: auto;
  }
}
</style>