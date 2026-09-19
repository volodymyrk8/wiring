/* Compatibility shim. The application shell is built from src/app/bootstrap.js. */
(() => {
  const root = document.getElementById("app");
  const base = root?.dataset.base || "";
  import(`${base}/public/dist/app.js?v=2`).catch((error) => {
    if (root) root.innerHTML = `<p class="err">не загрузилось приложение: ${String(error?.message || error)}</p>`;
  });
})();
