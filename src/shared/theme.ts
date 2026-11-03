import { ref } from "vue";

export type ThemeMode = "light" | "dark";

const THEME_KEY = "chartforge.theme";

export const themeMode = ref<ThemeMode>("light");

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function apply(mode: ThemeMode): void {
  themeMode.value = mode;
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.theme = mode;
}

export function getTheme(): ThemeMode {
  return themeMode.value;
}

export function setTheme(mode: ThemeMode): void {
  apply(mode);
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* 忽略存储失败 */
  }
}

export function toggleTheme(): void {
  setTheme(themeMode.value === "dark" ? "light" : "dark");
}

export function initTheme(): void {
  apply(readStored());
}
