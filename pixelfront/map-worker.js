import { makeMap } from "./map.js";
self.onmessage = event => {
  const { seed, mapType } = event.data;
  try {
    const map = makeMap(seed, mapType, (stage, percent) => self.postMessage({ type: "progress", stage, percent }));
    self.postMessage({ type: "complete", map }, [map.land.buffer, map.rawHeight.buffer, map.elevation.buffer, map.terrain.buffer, map.riverMask.buffer]);
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || "맵 생성에 실패했습니다." });
  }
};
