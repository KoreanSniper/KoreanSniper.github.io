(() => {
  const stationEntries = Object.entries(stations).map(([name, value]) => ({
    name,
    x: value[0],
    y: value[1],
    region: value[2] || ""
  }));

  const lineEntries = Object.entries(station_data).map(([lineName, line]) => ({
    lineName,
    displayName: line.display_name || lineName,
    color: Array.isArray(line.color) && line.color.length >= 4
      ? `rgba(${Math.round(line.color[0] * 255)}, ${Math.round(line.color[1] * 255)}, ${Math.round(line.color[2] * 255)}, ${line.color[3]})`
      : "rgba(148, 163, 184, 1)",
    stations: Array.isArray(line.stations) ? line.stations.filter(name => stations[name]) : [],
    planned: Boolean(line.planned),
    isLoop: Boolean(line.is_loop)
  })).filter(line => line.stations.length >= 2);

  const lineByName = Object.fromEntries(lineEntries.map(line => [line.lineName, line]));
  const lineByDisplayName = Object.fromEntries(lineEntries.map(line => [line.displayName, line]));

  const lineSegments = [];
  lineEntries.forEach(line => {
    for (let i = 0; i < line.stations.length - 1; i++) {
      lineSegments.push({
        from: line.stations[i],
        to: line.stations[i + 1],
        lineName: line.lineName,
        displayName: line.displayName,
        color: line.color,
        planned: line.planned,
        isLoop: line.isLoop
      });
    }
  });

  const stationMap = Object.fromEntries(stationEntries.map(station => [station.name, station]));
  const adjacency = new Map();

  for (const station of stationEntries) {
    adjacency.set(station.name, []);
  }

  for (const segment of lineSegments) {
    if (segment.planned) continue;
    adjacency.get(segment.from)?.push(segment.to);
    adjacency.get(segment.to)?.push(segment.from);
  }

  const svg = document.getElementById("map");
  const viewport = document.getElementById("viewport");
  const resultBox = document.getElementById("resultBox");
  const regionBox = document.getElementById("regionBox");
  const stationSearchInput = document.getElementById("stationSearch");
  const lineSearchInput = document.getElementById("lineSearch");
  const startInput = document.getElementById("start");
  const viaInput = document.getElementById("via");
  const endInput = document.getElementById("end");
  const stationOptions = document.getElementById("stationOptions");
  const lineOptions = document.getElementById("lineOptions");
  const categoryFilters = document.getElementById("categoryFilters");
  const lineGroups = document.getElementById("lineGroups");
  const findRouteBtn = document.getElementById("findRouteBtn");
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
    highlightedStation: null,
    highlightedLine: null,
    highlightedPath: [],
    highlightedPathSet: new Set(),
    highlightedEdgeSet: new Set(),
    enabledCategories: new Set(["active", "planned"])
  };

  const elements = {
    lines: [],
    stations: [],
    labels: [],
    linePills: []
  };

  let viewportFrame = 0;

  const bounds = stationEntries.reduce((acc, station) => ({
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

  const pad = 140;
  const viewBox = [
    bounds.minX - pad,
    bounds.minY - pad,
    (bounds.maxX - bounds.minX) + pad * 2,
    (bounds.maxY - bounds.minY) + pad * 2
  ];
  svg.setAttribute("viewBox", viewBox.join(" "));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  function setResult(message, strong = false) {
    resultBox.innerHTML = strong ? `<strong>${message}</strong>` : message;
  }

  function setRegion(message, strong = false) {
    regionBox.innerHTML = strong ? `<strong>${message}</strong>` : message;
  }

  function clampScale(value) {
    return Math.max(0.5, Math.min(3, value));
  }

  function updateViewport() {
    if (viewportFrame) return;
    viewportFrame = requestAnimationFrame(() => {
      viewportFrame = 0;
      viewport.setAttribute("transform", `translate(${state.x},${state.y}) scale(${state.scale})`);
    });
  }

  function setDragging(isDragging) {
    state.dragging = isDragging;
    svg.classList.toggle("is-dragging", isDragging);
  }

  function fitToBounds(targetNames, extraPadding = 120) {
    const points = targetNames
      .map(name => stationMap[name])
      .filter(Boolean);

    if (!points.length) return;

    const minX = Math.min(...points.map(point => point.x)) - extraPadding;
    const maxX = Math.max(...points.map(point => point.x)) + extraPadding;
    const minY = Math.min(...points.map(point => point.y)) - extraPadding;
    const maxY = Math.max(...points.map(point => point.y)) + extraPadding;

    const rect = svg.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;
    const scale = clampScale(Math.min(width / boxWidth, height / boxHeight, 1.6));

    const centerX = minX + boxWidth / 2;
    const centerY = minY + boxHeight / 2;

    state.scale = scale;
    state.x = width / 2 - centerX * scale;
    state.y = height / 2 - centerY * scale;
    updateViewport();
  }

  function getPoint(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function zoomAt(clientX, clientY, nextScale) {
    const bounded = clampScale(nextScale);
    const rect = svg.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const worldX = (localX - state.x) / state.scale;
    const worldY = (localY - state.y) / state.scale;
    state.scale = bounded;
    state.x = localX - worldX * state.scale;
    state.y = localY - worldY * state.scale;
    updateViewport();
  }

  function normalizeCategory(line) {
    return line.planned ? "planned" : "active";
  }

  function isCategoryEnabled(line) {
    return state.enabledCategories.has(normalizeCategory(line));
  }

  function rebuildStationOptions() {
    stationOptions.innerHTML = stationEntries
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
      .map(station => `<option value="${station.name}"></option>`)
      .join("");
  }

  function rebuildLineOptions() {
    lineOptions.innerHTML = lineEntries
      .slice()
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"))
      .map(line => `<option value="${line.displayName}"></option>`)
      .join("");
  }

  function rebuildCategoryFilters() {
    const categories = [
      { key: "active", label: "운행 노선" },
      { key: "planned", label: "계획 노선" }
    ];

    categoryFilters.innerHTML = categories.map(category => `
      <button class="filter-chip ${state.enabledCategories.has(category.key) ? "active" : ""}" data-category="${category.key}" type="button">
        <span>${category.label}</span>
      </button>
    `).join("");

    categoryFilters.querySelectorAll("[data-category]").forEach(button => {
      button.addEventListener("click", () => {
        const key = button.dataset.category;
        if (state.enabledCategories.has(key)) {
          state.enabledCategories.delete(key);
        } else {
          state.enabledCategories.add(key);
        }
        if (state.enabledCategories.size === 0) {
          state.enabledCategories.add("active");
        }
        refreshVisibility();
      });
    });
  }

  function rebuildLineGroups() {
    const grouped = {
      active: lineEntries.filter(line => !line.planned),
      planned: lineEntries.filter(line => line.planned)
    };

    lineGroups.innerHTML = Object.entries(grouped).map(([key, lines]) => {
      const title = key === "planned" ? "계획 노선" : "운행 노선";
      return `
        <section class="line-group">
          <h3>${title}</h3>
          <div class="line-list">
            ${lines.map(line => `
              <button class="line-pill" data-line="${line.lineName}" type="button">
                <span class="swatch" style="background:${line.color};"></span>
                <span>${line.displayName}</span>
              </button>
            `).join("")}
          </div>
        </section>
      `;
    }).join("");

    elements.linePills = Array.from(lineGroups.querySelectorAll(".line-pill"));
    elements.linePills.forEach(pill => {
      pill.addEventListener("click", () => focusLine(pill.dataset.line));
    });
  }

  function buildPathState(path) {
    const pathSet = new Set(path);
    const pathEdges = new Set();
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      pathEdges.add(`${a}__${b}`);
      pathEdges.add(`${b}__${a}`);
    }
    return { pathSet, pathEdges };
  }

  function addLineElements() {
    const lineLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    lineLayer.setAttribute("class", "train-map-lines");
    viewport.appendChild(lineLayer);

    lineSegments.forEach(segment => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", stationMap[segment.from].x);
      line.setAttribute("y1", stationMap[segment.from].y);
      line.setAttribute("x2", stationMap[segment.to].x);
      line.setAttribute("y2", stationMap[segment.to].y);
      line.setAttribute("stroke", segment.color);
      line.setAttribute("stroke-width", segment.planned ? "5" : "7");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("stroke-linejoin", "round");
      line.setAttribute("fill", "none");
      if (segment.planned) {
        line.setAttribute("stroke-dasharray", "12 10");
        line.setAttribute("opacity", "0.88");
      }
      line.style.pointerEvents = "none";
      lineLayer.appendChild(line);
      elements.lines.push({ element: line, segment });
    });
  }

  function addStationElements() {
    const stationLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    stationLayer.setAttribute("class", "train-map-stations");
    viewport.appendChild(stationLayer);

    stationEntries.forEach(station => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", station.x);
      circle.setAttribute("cy", station.y);
      circle.setAttribute("r", "6");
      circle.setAttribute("class", "station");
      circle.addEventListener("mouseenter", () => {
        if (!state.dragging) {
          setRegion(`역: ${station.name}<br>지역: ${station.region || "미지정"}`);
        }
      });
      circle.addEventListener("mouseleave", () => {
        if (!state.dragging && state.highlightedStation !== station.name) {
          setRegion("마우스를 올리면 역 정보가 표시됩니다.");
        }
      });
      circle.addEventListener("click", () => {
        if (!startInput.value) startInput.value = station.name;
        else if (!endInput.value || endInput.value === station.name) endInput.value = station.name;
        else stationSearchInput.value = station.name;
        focusStation(station.name);
      });
      stationLayer.appendChild(circle);
      elements.stations.push({ element: circle, station });

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", station.x);
      text.setAttribute("y", station.y + 18);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("class", "label");
      text.textContent = station.name;
      stationLayer.appendChild(text);
      elements.labels.push({ element: text, station });
    });
  }

  function renderMap() {
    addLineElements();
    addStationElements();
  }

  function getRoute(start, end) {
    if (!adjacency.has(start) || !adjacency.has(end)) return null;
    const queue = [start];
    let head = 0;
    const visited = new Set([start]);
    const prev = new Map();

    while (head < queue.length) {
      const current = queue[head++];
      if (current === end) break;
      for (const next of adjacency.get(current) || []) {
        if (visited.has(next)) continue;
        visited.add(next);
        prev.set(next, current);
        queue.push(next);
      }
    }

    if (start !== end && !prev.has(end)) return null;
    const path = [end];
    let cursor = end;
    while (cursor !== start) {
      cursor = prev.get(cursor);
      if (!cursor) return null;
      path.unshift(cursor);
    }
    return path;
  }

  function combineRoutes(stops) {
    const path = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const segment = getRoute(stops[i], stops[i + 1]);
      if (!segment) return null;
      if (i === 0) path.push(...segment);
      else path.push(...segment.slice(1));
    }
    return path;
  }

  function focusOnStations(names) {
    const points = names.map(name => stationMap[name]).filter(Boolean);
    if (!points.length) return;
    const minX = Math.min(...points.map(point => point.x));
    const maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const maxY = Math.max(...points.map(point => point.y));
    fitToBounds(names, Math.max(120, Math.max(maxX - minX, maxY - minY) * 0.35));
  }

  function focusStation(name) {
    const station = stationMap[name];
    if (!station) return;
    state.highlightedStation = name;
    state.highlightedLine = null;
    state.highlightedPath = [];
    state.highlightedPathSet = new Set();
    state.highlightedEdgeSet = new Set();
    focusOnStations([name]);
    setRegion(`역: ${station.name}<br>지역: ${station.region || "미지정"}`);
    setResult(`<strong>${station.name}</strong><br>${station.region || "미지정 지역"}의 역입니다.`, true);
    refreshVisibility();
  }

  function focusLine(lineName) {
    const line = lineByName[lineName];
    if (!line) return;
    state.highlightedLine = lineName;
    state.highlightedStation = null;
    state.highlightedPath = [];
    state.highlightedPathSet = new Set();
    state.highlightedEdgeSet = new Set();
    focusOnStations(line.stations);
    setResult(`<strong>${line.displayName}</strong><br>${line.stations.length}개 역이 연결된 노선입니다.`, true);
    setRegion("마우스를 올리면 역 정보가 표시됩니다.");
    refreshVisibility();
  }

  function setRouteHighlight(path) {
    state.highlightedPath = path || [];
    const { pathSet, pathEdges } = buildPathState(state.highlightedPath);
    state.highlightedPathSet = pathSet;
    state.highlightedEdgeSet = pathEdges;
    state.highlightedStation = null;
    state.highlightedLine = null;
    refreshVisibility();
  }

  function refreshVisibility() {
    const pathSet = state.highlightedPathSet;
    const pathEdges = state.highlightedEdgeSet;

    elements.lines.forEach(({ element, segment }) => {
      const category = segment.planned ? "planned" : "active";
      const categoryEnabled = state.enabledCategories.has(category);
      const isLineFocused = state.highlightedLine && segment.lineName === state.highlightedLine;
      const isPathEdge = pathEdges.has(`${segment.from}__${segment.to}`);

      element.style.display = categoryEnabled ? "" : "none";
      element.setAttribute("stroke-opacity", isPathEdge ? "1" : isLineFocused ? "0.95" : categoryEnabled ? "0.95" : "0.12");
      element.setAttribute("stroke-width", isPathEdge ? "9" : segment.planned ? "5" : "7");
      if (isPathEdge) {
        element.setAttribute("stroke", "#ef4444");
      } else {
        element.setAttribute("stroke", segment.color);
      }
    });

    elements.stations.forEach(({ element, station }) => {
      const isHighlighted = state.highlightedStation === station.name;
      const onRoute = pathSet.has(station.name);
      element.setAttribute("r", isHighlighted ? "9" : onRoute ? "7" : "6");
      element.setAttribute("fill", isHighlighted ? "#22c55e" : onRoute ? "#f97316" : "#f8fafc");
      element.setAttribute("opacity", state.enabledCategories.has("active") || state.enabledCategories.has("planned") ? "1" : "0.3");
      if (onRoute) {
        element.setAttribute("stroke", "#1f2937");
        element.setAttribute("stroke-width", "2");
      } else {
        element.setAttribute("stroke", "#020617");
        element.setAttribute("stroke-width", "2");
      }
    });

    elements.labels.forEach(({ element, station }) => {
      const isHighlighted = state.highlightedStation === station.name;
      const onRoute = pathSet.has(station.name);
      element.style.opacity = isHighlighted || onRoute ? "1" : "0.86";
      element.classList.toggle("highlighted", isHighlighted);
    });

    elements.linePills.forEach(pill => {
      const line = lineByName[pill.dataset.line];
      const active = line ? state.enabledCategories.has(normalizeCategory(line)) : false;
      pill.classList.toggle("filtered-out", !active);
      pill.classList.toggle("active", state.highlightedLine === pill.dataset.line);
    });
  }

  function findRoute() {
    const start = startInput.value.trim();
    const end = endInput.value.trim();
    const via = viaInput.value.split(",").map(value => value.trim()).filter(Boolean);
    const checkpoints = [start, ...via, end].filter(Boolean);

    if (!start || !end) {
      setResult("출발역과 도착역을 입력하세요.", true);
      return;
    }

    for (const name of checkpoints) {
      if (!stationMap[name]) {
        setResult(`역을 찾지 못했습니다: ${name}`, true);
        return;
      }
    }

    const path = combineRoutes(checkpoints);
    if (!path) {
      setResult("연결된 경로를 찾지 못했습니다.", true);
      return;
    }

    setRouteHighlight(path);
    focusOnStations(path);
    const viaText = via.length ? ` / 경유: ${via.join(", ")}` : "";
    setResult(`<strong>최단 경로 ${path.length - 1}구간</strong><br>${start}${viaText} → ${end}<br>${path.join(" → ")}`, true);
  }

  function resetView() {
    state.scale = 1;
    state.x = 0;
    state.y = 0;
    state.highlightedStation = null;
    state.highlightedLine = null;
    state.highlightedPath = [];
    state.highlightedPathSet = new Set();
    state.highlightedEdgeSet = new Set();
    state.enabledCategories = new Set(["active", "planned"]);
    updateViewport();
    rebuildCategoryFilters();
    refreshVisibility();
    setResult("출발역과 도착역을 입력하면 최단 경로가 표시됩니다.");
    setRegion("마우스를 올리면 역 정보가 표시됩니다.");
    stationSearchInput.value = "";
    lineSearchInput.value = "";
    startInput.value = "";
    viaInput.value = "";
    endInput.value = "";
    fitToBounds(stationEntries.map(station => station.name), 160);
  }

  function toggleTopbar() {
    if (!topbar || !toggleTopbarBtn) return;
    const collapsed = topbar.classList.toggle("is-hidden");
    toggleTopbarBtn.setAttribute("aria-pressed", collapsed ? "true" : "false");
    toggleTopbarBtn.textContent = collapsed ? "상단 펴기" : "상단 접기";
  }

  function wireEvents() {
    findRouteBtn.addEventListener("click", findRoute);
    resetViewBtn.addEventListener("click", resetView);

    stationSearchInput.addEventListener("change", () => {
      const name = stationSearchInput.value.trim();
      if (stationMap[name]) {
        focusStation(name);
      } else {
        setResult("검색한 역을 찾지 못했습니다.", true);
      }
    });

    lineSearchInput.addEventListener("change", () => {
      const input = lineSearchInput.value.trim();
      const line = lineByName[input] || lineByDisplayName[input];
      if (line) focusLine(line.lineName);
      else setResult("검색한 노선을 찾지 못했습니다.", true);
    });

    [startInput, viaInput, endInput].forEach(input => {
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          findRoute();
        }
      });
    });

    svg.addEventListener("mousedown", event => {
      setDragging(true);
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
      setDragging(false);
    });

    svg.addEventListener("mouseleave", () => {
      setDragging(false);
    });

    svg.addEventListener("wheel", event => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, state.scale + (event.deltaY > 0 ? -0.1 : 0.1));
    }, { passive: false });

    let touchDistance = 0;
    svg.addEventListener("touchstart", event => {
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        setDragging(true);
        state.dragStartX = touch.clientX - state.x;
        state.dragStartY = touch.clientY - state.y;
      } else if (event.touches.length === 2) {
        setDragging(false);
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
      setDragging(false);
      touchDistance = 0;
    });

    if (toggleTopbarBtn) {
      toggleTopbarBtn.addEventListener("click", toggleTopbar);
    }
  }

  function initialRender() {
    rebuildStationOptions();
    rebuildLineOptions();
    rebuildCategoryFilters();
    rebuildLineGroups();
    renderMap();
    wireEvents();
    fitToBounds(stationEntries.map(station => station.name), 160);
    refreshVisibility();
    setResult("출발역과 도착역을 입력하면 최단 경로가 표시됩니다.");
  }

  initialRender();
})();
