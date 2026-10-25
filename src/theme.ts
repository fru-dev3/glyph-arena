// Follow the system appearance unless the user picked one in Settings.
const media = matchMedia("(prefers-color-scheme: dark)");
export function applyTheme() {
  let t = "system";
  try { t = localStorage.getItem("arena.theme") || "system"; } catch { /* storage off */ }
  document.documentElement.dataset.theme = t === "dark" || (t === "system" && media.matches) ? "dark" : "light";
}
media.addEventListener("change", applyTheme);
