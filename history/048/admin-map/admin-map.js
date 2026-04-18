(() => {
  const EPS = 1e-9;
  const palette = [
    "#60a5fa",
    "#34d399",
    "#f59e0b",
    "#f472b6",
    "#a78bfa",
    "#22d3ee",
    "#fb7185",
    "#f97316",
    "#84cc16",
    "#38bdf8"
  ];

  const stationList = Object.entries(stations).map(([name, value]) => ({
    name,
    x: value[0],
    y: value[1],
    region: value[2] || "미분류"
  }));

  const stationByName = Object.fromEntries(stationList.map(station => [station.name, station]));
  const regionMap = new Map();
  for (const station of stationList) {
    if (!regionMap.has(station.region)) regionMap.set(station.region, []);
    regionMap.get(station.region).push(station);
  }

  const regionEntries = Array.from(regionMap.entries())
    .map(([region, stationsInRegion]) => {
      const center = stationsInRegion.reduce((acc, station) => ({
        x: acc.x + station.x,
        y: acc.y + station.y
      }), { x: 0, y: 0 });

      return {
        region,
        stations: stationsInRegion.slice().sort((a, b) => a.name.localeCompare(b.name, "ko")),
        count: stationsInRegion.length,
        center: {
          x: center.x / stationsInRegion.length,
          y: center.y / stationsInRegion.length
        }
      };
    })
    .sort((a, b) => b.count - a.count || a.region.localeCompare(b.region, "ko"));

  function hashStations(list) {
    let hash = 2166136261;
    for (const station of list) {
      const text = `${station.name}|${station.x}|${station.y}|${station.region};`;
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
    }
    return hash.toString(36);
  }

  const signature = hashStations(stationList);
  const voronoiCache = window.ADMIN_MAP_VORONOI_CACHE?.signature === signature
    ? window.ADMIN_MAP_VORONOI_CACHE
    : null;
  const cachedRegions = new Map((voronoiCache?.regions || []).map(region => [region.region, region]));

  const svg = document.getElementById("map");
  const viewport = document.getElementById("viewport");
  const regionLegend = document.getElementById("regionLegend");
  const hoverRegionInfo = document.getElementById("hoverRegionInfo");
  const zoomInBtn = document.getElementById("zoomIn");
  const zoomOutBtn = document.getElementById("zoomOut");
  const resetViewBtn = document.getElementById("resetViewBtn");
  const toggleTopbarBtn = document.getElementById("toggleTopbarBtn");
  const topbar = document.querySelector(".map-topbar");

  const state = {
    scale: 1,
    x: 0,
    y: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    selectedRegion: null,
    hoveredRegion: null
  };

  const elements = {
    regionPaths: new Map(),
    regionLabels: new Map(),
    dots: new Map(),
    legendButtons: new Map()
  };

  const bounds = stationList.reduce((acc, station) => ({
    minX: Math.min(acc.minX, station.x),
    maxX: Math.max(acc.maxX, station.x),
    minY: Math.min(acc.minY, station.y),
    maxY: Math.max(acc.maxY, station.y)
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity
  });

  const margin = 200;
  const fallbackViewBox = [
    bounds.minX - margin,
    bounds.minY - margin,
    (bounds.maxX - bounds.minX) + margin * 2,
    (bounds.maxY - bounds.minY) + margin * 2
  ];
  const viewBox = voronoiCache?.viewBox || fallbackViewBox;
  svg.setAttribute("viewBox", viewBox.join(" "));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  function colorForRegion(region) {
    let hash = 0;
    for (const char of region) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const base = palette[hash % palette.length];
    return {
      fill: `${base}22`,
      fillHover: `${base}2b`,
      fillActive: `${base}38`,
      stroke: `${base}88`,
      text: base
    };
  }

  function clampScale(value) {
    return Math.max(0.55, Math.min(3, value));
  }

  function updateViewport() {
    viewport.setAttribute("transform", `translate(${state.x},${state.y}) scale(${state.scale})`);
  }

  function zoomAt(clientX, clientY, nextScale) {
    const rect = svg.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const worldX = (localX - state.x) / state.scale;
    const worldY = (localY - state.y) / state.scale;
    state.scale = clampScale(nextScale);
    state.x = localX - worldX * state.scale;
    state.y = localY - worldY * state.scale;
    updateViewport();
  }

  function fitToBounds(names, padding = 160) {
    const points = names.map(name => stationByName[name]).filter(Boolean);
    if (!points.length) return;

    const minX = Math.min(...points.map(point => point.x)) - padding;
    const maxX = Math.max(...points.map(point => point.x)) + padding;
    const minY = Math.min(...points.map(point => point.y)) - padding;
    const maxY = Math.max(...points.map(point => point.y)) + padding;

    const rect = svg.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    const boxWidth = Math.max(maxX - minX, 1);
    const boxHeight = Math.max(maxY - minY, 1);
    const scale = clampScale(Math.min(width / boxWidth, height / boxHeight, 1.55));
    const centerX = minX + boxWidth / 2;
    const centerY = minY + boxHeight / 2;

    state.scale = scale;
    state.x = width / 2 - centerX * scale;
    state.y = height / 2 - centerY * scale;
    updateViewport();
  }

  function setInfo(region, samples = []) {
    if (!hoverRegionInfo) return;
    if (!region) {
      hoverRegionInfo.innerHTML = "마우스를 올리면 구역 정보가 표시됩니다.";
      return;
    }

    const sampleText = samples.slice(0, 4).join(", ");
    hoverRegionInfo.innerHTML = `
      <strong>${region.region}</strong><br>
      역 ${region.count}개 · ${sampleText || "표시할 역이 없습니다"}
    `;
  }

  function renderLegend() {
    if (!regionLegend) return;

    regionLegend.innerHTML = regionEntries.map(region => {
      const color = colorForRegion(region.region);
      return `
        <button class="line-pill" data-region="${region.region}" type="button">
          <span class="swatch" style="background:${color.text};"></span>
          <span>${region.region} · ${region.count}</span>
        </button>
      `;
    }).join("");

    regionLegend.querySelectorAll("[data-region]").forEach(button => {
      const regionName = button.dataset.region;
      elements.legendButtons.set(regionName, button);
      button.addEventListener("click", () => focusRegion(regionName));
    });
  }

  function polygonArea(points) {
    if (points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    return area / 2;
  }

  function clipPolygonByBisector(polygon, a, b) {
    if (!polygon.length) return [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const limit = (b.x * b.x + b.y * b.y - a.x * a.x - a.y * a.y) / 2;
    const inside = point => point.x * dx + point.y * dy <= limit + EPS;
    const intersect = (p1, p2) => {
      const d1 = p1.x * dx + p1.y * dy - limit;
      const d2 = p2.x * dx + p2.y * dy - limit;
      const ratio = d1 / (d1 - d2);
      return {
        x: p1.x + (p2.x - p1.x) * ratio,
        y: p1.y + (p2.y - p1.y) * ratio
      };
    };

    const result = [];
    let prev = polygon[polygon.length - 1];
    let prevInside = inside(prev);

    for (const curr of polygon) {
      const currInside = inside(curr);
      if (currInside) {
        if (!prevInside) result.push(intersect(prev, curr));
        result.push(curr);
      } else if (prevInside) {
        result.push(intersect(prev, curr));
      }
      prev = curr;
      prevInside = currInside;
    }

    return result;
  }

  function buildVoronoiCell(station) {
    let polygon = [
      { x: viewBox[0], y: viewBox[1] },
      { x: viewBox[0] + viewBox[2], y: viewBox[1] },
      { x: viewBox[0] + viewBox[2], y: viewBox[1] + viewBox[3] },
      { x: viewBox[0], y: viewBox[1] + viewBox[3] }
    ];

    for (const other of stationList) {
      if (other === station) continue;
      polygon = clipPolygonByBisector(polygon, station, other);
      if (!polygon.length) break;
    }

    if (polygonArea(polygon) < 0) polygon.reverse();
    return polygon;
  }

  function polygonToPath(points) {
    if (!points.length) return "";
    return `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")} Z`;
  }

  function buildRegionPath(stationsInRegion) {
    return stationsInRegion
      .map(buildVoronoiCell)
      .map(polygonToPath)
      .filter(Boolean)
      .join(" ");
  }

  function renderMap() {
    const cellLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    cellLayer.setAttribute("class", "region-cell-layer");

    const labelLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    labelLayer.setAttribute("class", "region-label-layer");

    const dotLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    dotLayer.setAttribute("class", "region-dot-layer");

    for (const region of regionEntries) {
      const color = colorForRegion(region.region);
      const cached = cachedRegions.get(region.region);
      const pathData = cached?.path || buildRegionPath(region.stations);
      const center = cached?.center || region.center;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "region-zone");
      path.setAttribute("d", pathData);
      path.setAttribute("fill", color.fill);
      path.setAttribute("stroke", "none");
      path.setAttribute("fill-rule", "evenodd");
      path.style.cursor = "pointer";

      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${region.region} · ${region.count}개 역`;
      path.appendChild(title);

      path.addEventListener("mouseenter", () => {
        state.hoveredRegion = region.region;
        setInfo(region, region.stations.map(station => station.name));
        refreshState();
      });
      path.addEventListener("mouseleave", () => {
        state.hoveredRegion = null;
        if (!state.selectedRegion) setInfo(null);
        refreshState();
      });
      path.addEventListener("click", () => focusRegion(region.region));

      cellLayer.appendChild(path);
      elements.regionPaths.set(region.region, path);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "region-label");
      label.setAttribute("x", center.x);
      label.setAttribute("y", center.y - 6);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("pointer-events", "none");
      label.textContent = region.region;

      const count = document.createElementNS("http://www.w3.org/2000/svg", "text");
      count.setAttribute("class", "region-count");
      count.setAttribute("x", center.x);
      count.setAttribute("y", center.y + 16);
      count.setAttribute("text-anchor", "middle");
      count.setAttribute("pointer-events", "none");
      count.textContent = `역 ${region.count}개`;

      labelLayer.appendChild(label);
      labelLayer.appendChild(count);
      elements.regionLabels.set(region.region, { label, count });
    }

    for (const station of stationList) {
      const color = colorForRegion(station.region);
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("class", "region-dot");
      dot.setAttribute("cx", station.x);
      dot.setAttribute("cy", station.y);
      dot.setAttribute("r", "5.5");
      dot.setAttribute("fill", "#f8fafc");
      dot.setAttribute("stroke", color.text);
      dot.setAttribute("stroke-width", "2.2");

      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${station.name} · ${station.region}`;
      dot.appendChild(title);

      dot.addEventListener("mouseenter", () => {
        setInfo({
          region: station.region,
          count: regionMap.get(station.region)?.length || 1
        }, [station.name]);
      });
      dot.addEventListener("mouseleave", () => {
        if (!state.selectedRegion && !state.hoveredRegion) setInfo(null);
      });
      dot.addEventListener("click", () => focusRegion(station.region));

      dotLayer.appendChild(dot);
      elements.dots.set(station.name, dot);
    }

    viewport.appendChild(cellLayer);
    viewport.appendChild(labelLayer);
    viewport.appendChild(dotLayer);
  }

  function refreshState() {
    for (const region of regionEntries) {
      const color = colorForRegion(region.region);
      const path = elements.regionPaths.get(region.region);
      const labels = elements.regionLabels.get(region.region);
      const active = state.selectedRegion === region.region;
      const hovered = state.hoveredRegion === region.region;
      const muted = state.selectedRegion && !active;

      if (path) {
        path.setAttribute("fill", active ? color.fillActive : hovered ? color.fillHover : color.fill);
        path.style.opacity = muted ? "0.24" : hovered ? "1" : "0.96";
      }

      if (labels) {
        labels.label.style.opacity = muted ? "0.2" : hovered || active ? "1" : "0.82";
        labels.count.style.opacity = muted ? "0.18" : hovered || active ? "1" : "0.7";
      }
    }

    elements.dots.forEach((dot, stationName) => {
      const station = stationByName[stationName];
      const active = state.selectedRegion === station.region;
      const muted = state.selectedRegion && !active;
      dot.style.opacity = muted ? "0.2" : active ? "1" : "0.85";
    });

    elements.legendButtons.forEach((button, regionName) => {
      button.classList.toggle("active", state.selectedRegion === regionName);
      button.classList.toggle("filtered-out", Boolean(state.selectedRegion && state.selectedRegion !== regionName));
    });
  }

  function focusRegion(regionName) {
    const region = regionEntries.find(entry => entry.region === regionName);
    if (!region) return;
    state.selectedRegion = regionName;
    state.hoveredRegion = regionName;
    setInfo(region, region.stations.map(station => station.name));
    fitToBounds(region.stations.map(station => station.name), Math.max(120, region.count * 10));
    refreshState();
  }

  function resetView() {
    state.scale = 1;
    state.x = 0;
    state.y = 0;
    state.selectedRegion = null;
    state.hoveredRegion = null;
    updateViewport();
    setInfo(null);
    refreshState();
    fitToBounds(stationList.map(station => station.name), 180);
  }

  function toggleTopbar() {
    if (!topbar || !toggleTopbarBtn) return;
    const collapsed = topbar.classList.toggle("is-hidden");
    toggleTopbarBtn.setAttribute("aria-pressed", collapsed ? "true" : "false");
    toggleTopbarBtn.textContent = collapsed ? "상단 펴기" : "상단 접기";
  }

  function wireEvents() {
    svg.addEventListener("mousedown", event => {
      state.dragging = true;
      state.dragStartX = event.clientX - state.x;
      state.dragStartY = event.clientY - state.y;
    });

    svg.addEventListener("mousemove", event => {
      if (!state.dragging) return;
      state.x = event.clientX - state.dragStartX;
      state.y = event.clientY - state.dragStartY;
      updateViewport();
    });

    svg.addEventListener("mouseup", () => {
      state.dragging = false;
    });

    svg.addEventListener("mouseleave", () => {
      state.dragging = false;
    });

    svg.addEventListener("wheel", event => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, state.scale + (event.deltaY > 0 ? -0.1 : 0.1));
    }, { passive: false });

    let touchDistance = 0;
    svg.addEventListener("touchstart", event => {
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        state.dragging = true;
        state.dragStartX = touch.clientX - state.x;
        state.dragStartY = touch.clientY - state.y;
      } else if (event.touches.length === 2) {
        state.dragging = false;
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        touchDistance = Math.hypot(dx, dy);
      }
    }, { passive: false });

    svg.addEventListener("touchmove", event => {
      event.preventDefault();
      if (event.touches.length === 1 && state.dragging) {
        const touch = event.touches[0];
        state.x = touch.clientX - state.dragStartX;
        state.y = touch.clientY - state.dragStartY;
        updateViewport();
      } else if (event.touches.length === 2) {
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        const nextDistance = Math.hypot(dx, dy) || 1;
        const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        zoomAt(centerX, centerY, state.scale * (nextDistance / (touchDistance || nextDistance)));
        touchDistance = nextDistance;
      }
    }, { passive: false });

    svg.addEventListener("touchend", () => {
      state.dragging = false;
      touchDistance = 0;
    });

    if (zoomInBtn) {
      zoomInBtn.addEventListener("click", () => zoomAt(window.innerWidth / 2, window.innerHeight / 2, state.scale + 0.2));
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener("click", () => zoomAt(window.innerWidth / 2, window.innerHeight / 2, state.scale - 0.2));
    }

    if (resetViewBtn) {
      resetViewBtn.addEventListener("click", resetView);
    }

    if (toggleTopbarBtn) {
      toggleTopbarBtn.addEventListener("click", toggleTopbar);
    }
  }

  renderLegend();
  renderMap();
  wireEvents();
  fitToBounds(stationList.map(station => station.name), 180);
  refreshState();
  setInfo(null);
})();
