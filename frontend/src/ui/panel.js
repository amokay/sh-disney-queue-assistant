import { waitColorClass } from "../config.js";

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function mountLeftPanel(root, { getData }) {
  root.innerHTML = `
    <aside class="panel panel--dock">
      <div class="panel__head">
        <div class="panel__title">迪士尼乐园导览</div>
        <input class="panel__search" type="search" placeholder="搜索景点…" />
      </div>
      <div class="panel__list"></div>
      <div class="panel__foot">
        <label class="panel__toggle">
          <input type="checkbox" id="toggle-parade" />
          显示花车巡游路线（占位）
        </label>
      </div>
    </aside>
  `;

  const search = root.querySelector(".panel__search");
  const list = root.querySelector(".panel__list");
  const parade = root.querySelector("#toggle-parade");

  let rows = [];

  function render() {
    const q = (search.value || "").trim().toLowerCase();
    const data = getData() || [];
    rows = data.filter((x) => {
      if (!q) return true;
      return (
        String(x.name).toLowerCase().includes(q) ||
        String(x.zone).toLowerCase().includes(q) ||
        String(x.id).toLowerCase().includes(q)
      );
    });

    list.innerHTML = rows
      .map((a) => {
        const wm = a.waitMinutes;
        const wc = waitColorClass(wm);
        const waitText = wm == null ? "—" : `${wm} 分钟`;
        return `
          <div class="row" data-id="${esc(a.id)}">
            <div class="row__main">
              <div class="row__name">${esc(a.name)}</div>
              <div class="row__meta">${esc(a.zone)} · <span class="${wc}">${esc(waitText)}</span></div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  search.addEventListener("input", () => render());

  list.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const row = t.closest(".row");
    if (row) {
      const id = row.getAttribute("data-id");
      const item = (getData() || []).find((x) => x.id === id);
      if (item) {
        window.dispatchEvent(new CustomEvent("attraction-clicked", { detail: { attraction: item } }));
      }
    }
  });

  parade.addEventListener("change", () => {
    const on = /** @type {HTMLInputElement} */ (parade).checked;
    window.dispatchEvent(new CustomEvent("parade-toggle", { detail: { visible: on } }));
  });

  render();

  return { refresh: render };
}
