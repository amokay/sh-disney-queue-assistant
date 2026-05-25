import { getAllAttractions } from "../models/Attraction.js";
import { getLatestWaitTimes } from "../models/WaitTime.js";

export function getWaitTimesWithAttractions() {
  const attractions = getAllAttractions();
  const waits = getLatestWaitTimes();
  const map = new Map(waits.map((w) => [w.attraction_id, w]));

  return attractions.map((a) => {
    const w = map.get(a.id);
    return {
      id: a.id,
      name: a.name,
      zone: a.zone,
      waitMinutes: w ? w.wait_minutes : null,
      status: w ? w.status : "unknown",
    };
  });
}
