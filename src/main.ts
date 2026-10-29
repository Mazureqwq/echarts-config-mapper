import { createApp } from "vue";
import "element-plus/dist/index.css";
import App from "./App.vue";
import "./style/tokens.css";
import { setupStore } from "@/stores";

const app = createApp(App);
setupStore(app);
app.mount("#app");
