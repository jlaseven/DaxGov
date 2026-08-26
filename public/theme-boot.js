(function () {
  var theme = "light";
  try {
    theme = localStorage.getItem("cybergov-theme") || "";
  } catch (e) {}
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
