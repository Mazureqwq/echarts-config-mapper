import { createRouter, createWebHashHistory } from "vue-router";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      name: "library",
      component: () => import("@/views/LibraryView.vue"),
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
