export type ThemeMode = "light" | "dark";

const THEME_KEY = "chartforge.theme";

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

let current: ThemeMode = "light";

function apply(mode: ThemeMode): void {
  current = mode;
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.theme = mode;
}

export function getTheme(): ThemeMode {
  return current;
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
  setTheme(current === "dark" ? "light" : "dark");
}

export function initTheme(): void {
  apply(readStored());
}
