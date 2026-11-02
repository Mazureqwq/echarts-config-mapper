import { createRouter, createWebHashHistory, type Router } from "vue-router";
import EditorView from "@/views/EditorView.vue";

// 路由表：/editor 为主编辑器（常驻加载），其余页面懒加载；
// designer/screen 为全屏工作区，meta.nav=false 隐藏顶部导航
export const router: Router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/library" },
    { path: "/library", component: () => import("@/views/library/LibraryView.vue") },
    { path: "/editor", component: EditorView },
    { path: "/screens", component: () => import("@/views/screens/ScreensView.vue") },
    {
      path: "/designer/:id",
      component: () => import("@/views/designer/DesignerView.vue"),
      meta: { nav: false },
    },
    {
      path: "/screen/:id",
      component: () => import("@/views/screen-render/ScreenRenderView.vue"),
      meta: { nav: false },
    },
  ],
});
