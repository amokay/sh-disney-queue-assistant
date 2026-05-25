/** 行中：入园=当前时刻，离园默认闭园（后续可接迪士尼营业时间 API） */
export function defaultInparkWindow(exitTime = "21:00") {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return {
    parkDate: now.toISOString().slice(0, 10),
    entryTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    exitTime,
  };
}

export function formatParkDayLabel(parkDate) {
  try {
    const d = new Date(`${parkDate}T12:00:00`);
    return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
  } catch {
    return parkDate;
  }
}
