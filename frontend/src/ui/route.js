/**
 * 路线面板已清空，等待重新设计。
 * 保留导出的 mountRoutePanel 函数签名以避免 main.js 调用报错。
 *
 * @param {() => string[]} _getSelectedIds
 * @param {(next: string[]) => void} _setSelectedIds
 * @param {(id: string) => unknown} _getItemById
 * @returns {{ open: () => void, render: () => void }}
 */
export function mountRoutePanel(_getSelectedIds, _setSelectedIds, _getItemById) {
  const root = document.createElement("div");
  root.className = "route";
  root.innerHTML = `<div class="route__card"></div>`;
  document.body.appendChild(root);

  return {
    open: () => {},
    render: () => {},
  };
}
