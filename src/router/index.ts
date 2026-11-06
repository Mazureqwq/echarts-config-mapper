import { createRouter, createWebHashHistory } from "vue-router";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      // 图表库是入口：先做图表，再用图表搭大屏
      path: "/",
      redirect: "/charts",
    },
    {
      path: "/screens",
      name: "library",
      component: () => import("@/views/LibraryView.vue"),
    },
    {
      path: "/charts",
      name: "charts",
      component: () => import("@/views/ChartsView.vue"),
    },
    {
      path: "/charts/:id",
      name: "chart-edit",
      component: () => import("@/views/ChartEditView.vue"),
      props: true,
    },
    {
      path: "/workbench/:id",
      name: "workbench",
      component: () => import("@/views/WorkbenchView.vue"),
      props: true,
    },
    {
      path: "/play/:id",
      name: "play",
      component: () => import("@/views/PlayView.vue"),
      props: true,
    },
  ],
});

export default router;
