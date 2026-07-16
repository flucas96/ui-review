const themeToggle = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");

themeToggle?.addEventListener("click", () => {
  const isDark = document.documentElement.classList.toggle("dark");
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
});
