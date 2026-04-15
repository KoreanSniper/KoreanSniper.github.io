// Station and line data processing
const stationList = Object.keys(stations).map(name => ({
    id: name,
    name,
    x: stations[name][0],
    y: stations[name][1],
    region: stations[name][2]
}));
const stationMap = Object.fromEntries(stationList.map(station => [station.id, station]));

const categoryLabels = {
    high_speed: "고속열차",
    general_train: "일반열차",
    subway: "지하철",
    light_rail: "경전철",
    planned: "개통예정"
};

function getLineCategory(lineName, line) {
    if (line.planned) return "planned";
    if (["JDX", "WSX", "YPX", "DDS", "DPX", "BSS", "OBR"].includes(lineName)) return "high_speed";
    if (["NSL", "NSL지선"].includes(lineName)) return "general_train";
    if (["신도시경전철", "트램", "트램지선", "국가산업선"].includes(lineName)) return "light_rail";
    return "subway";
}

const lineCatalog = Object.entries(station_data).map(([lineName, line]) => {
    const [r, g, b, a] = line.color;
    return {
        lineName,
        displayName: line.display_name || lineName, // 👈 추가
        ...line,
        category: getLineCategory(lineName, line),
        colorCss: `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})`
    };
});

const availableCategoryEntries = Object.entries(categoryLabels).filter(([key]) =>
    lineCatalog.some(line => line.category === key)
);
const activeCategories = new Set(availableCategoryEntries.map(([key]) => key));

const stationCategoryMap = stationList.reduce((map, station) => {
    map[station.name] = new Set();
    return map;
}, {});
lineCatalog.forEach(line => {
    (line.stations || []).forEach(stationName => {
        if (stationCategoryMap[stationName]) stationCategoryMap[stationName].add(line.category);
    });
});

function getStationBaseRadius(stationName) {
    const categories = stationCategoryMap[stationName];
    if (!categories) return 10;
    return categories.size === 1 && categories.has("light_rail") ? 6 : 10;
}

const lines = [];
for (const line of lineCatalog) {
    for (let i = 0; i < line.stations.length - 1; i++) {
        lines.push({
            from: line.stations[i],
            to: line.stations[i + 1],
            color: line.colorCss,
            lineName: line.lineName,
            planned: Boolean(line.planned),
            category: line.category
        });
    }
}

const OVERLAP_TOLERANCE = 0.01;
const lineElements = [];
const stationElements = [];
const labelElements = [];
const badgeElements = [];
const stationBadgePositions = {};
const globalBadgePositions = [];
const BADGE_RADIUS = 18;
const BADGE_BASE_OFFSET = 34;
const BADGE_MIN_SPACING = BADGE_RADIUS * 2 + 4;
let scale = 1, ox = 0, oy = 0, drag = false, sx = 0, sy = 0, highlightedStation = null, focusedLineName = null, highlightedPath = null;

const DENSE_CORE_BOUNDS = { minX: 180, maxX: 860, minY: -80, maxY: 430 };

const viewport = document.getElementById("viewport"),
    svg = document.getElementById("map"),
    stationSearchInput = document.getElementById("stationSearch"),
    lineSearchInput = document.getElementById("lineSearch"),
    startInput = document.getElementById("start"),
    viaInput = document.getElementById("via"),
    endInput = document.getElementById("end"),
    stationOptions = document.getElementById("stationOptions"),
    lineOptions = document.getElementById("lineOptions"),
    categoryFilters = document.getElementById("categoryFilters"),
    lineGroups = document.getElementById("lineGroups"),
    resultBox = document.getElementById("resultBox"),
    regionBox = document.getElementById("regionBox"),
    findRouteBtn = document.getElementById("findRouteBtn"),
    resetViewBtn = document.getElementById("resetViewBtn");

// Line geometry and overlap functions
function createLineGeometry(line) {
    const fromStation = stationMap[line.from],
        toStation = stationMap[line.to],
        dx = toStation.x - fromStation.x,
        dy = toStation.y - fromStation.y,
        length = Math.hypot(dx, dy) || 1;
    let unitX = dx / length, unitY = dy / length;
    if (unitX < 0 || (Math.abs(unitX) <= OVERLAP_TOLERANCE && unitY < 0)) {
        unitX *= -1;
        unitY *= -1;
    }
    return {
        ...line,
        x1: fromStation.x,
        y1: fromStation.y,
        x2: toStation.x,
        y2: toStation.y,
        length,
        travelUnitX: dx / length,
        travelUnitY: dy / length,
        unitX,
        unitY,
        normalX: -unitY,
        normalY: unitX
    };
}

function getLineProjectionRange(line) {
    const start = line.x1 * line.unitX + line.y1 * line.unitY,
        end = line.x2 * line.unitX + line.y2 * line.unitY;
    return [Math.min(start, end), Math.max(start, end)];
}

function isSameDirection(a, b) {
    return Math.abs(a.unitX - b.unitX) <= OVERLAP_TOLERANCE && Math.abs(a.unitY - b.unitY) <= OVERLAP_TOLERANCE;
}

function isCollinear(a, b) {
    const cross = (b.x1 - a.x1) * a.unitY - (b.y1 - a.y1) * a.unitX;
    return Math.abs(cross) <= OVERLAP_TOLERANCE;
}

function hasOverlappingRange(a, b) {
    const [aStart, aEnd] = getLineProjectionRange(a),
        [bStart, bEnd] = getLineProjectionRange(b);
    return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > OVERLAP_TOLERANCE;
}

function isOverlappingSegment(a, b) {
    return isSameDirection(a, b) && isCollinear(a, b) && hasOverlappingRange(a, b);
}

function getParallelOffset(index, total, gap = 10) {
    return (index - (total - 1) / 2) * gap;
}

function getRenderedSegmentPoints(line, overlapIndex, overlapCount) {
    const offset = getParallelOffset(overlapIndex, overlapCount),
        taper = Math.min(line.length * 0.3, 24);
    if (Math.abs(offset) <= OVERLAP_TOLERANCE || line.length <= taper * 2)
        return [[line.x1, line.y1], [line.x2, line.y2]];
    const innerStartX = line.x1 + line.travelUnitX * taper,
        innerStartY = line.y1 + line.travelUnitY * taper,
        innerEndX = line.x2 - line.travelUnitX * taper,
        innerEndY = line.y2 - line.travelUnitY * taper;
    return [
        [line.x1, line.y1],
        [innerStartX + line.normalX * offset, innerStartY + line.normalY * offset],
        [innerEndX + line.normalX * offset, innerEndY + line.normalY * offset],
        [line.x2, line.y2]
    ];
}

function getUnitVector(fromStationId, toStationId) {
    const fromStation = stationMap[fromStationId],
        toStation = stationMap[toStationId],
        dx = toStation.x - fromStation.x,
        dy = toStation.y - fromStation.y,
        length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
}

function getBadgeLabel(lineName) {
    const compactMap = {
        "중앙권순환철도": "중앙순환",
        "신도시경전철": "신도시",
        "트램지선": "트램지선",
        "국가산업선": "산업",
        "9호선": "9",
        "9호선지선": "9지선",
        "동영2호선지선": "동영2지선"
    };
    if (compactMap[lineName]) return compactMap[lineName];
    const trimmed = lineName.replace(/호선/g, "").replace(/계획선/g, "계획").replace(/연장계획/g, "연장").trim();
    if (trimmed.length <= 5) return trimmed;
    return trimmed.slice(0, 5);
}

function getBadgeFontSize(label) {
    if (label.length <= 2) return 14;
    if (label.length === 3) return 11;
    if (label.length === 4) return 9;
    return 8;
}

function isBadgePositionClear(x, y, stationKey) {
    return stationBadgePositions[stationKey].every(({ cx: px, cy: py }) =>
        Math.hypot(x - px, y - py) >= BADGE_MIN_SPACING
    ) && globalBadgePositions.every(({ cx: px, cy: py }) =>
        Math.hypot(x - px, y - py) >= BADGE_MIN_SPACING
    );
}

function isDenseCoreStation(name) {
    const station = stationMap[name];
    return station && station.x >= DENSE_CORE_BOUNDS.minX && station.x <= DENSE_CORE_BOUNDS.maxX &&
        station.y >= DENSE_CORE_BOUNDS.minY && station.y <= DENSE_CORE_BOUNDS.maxY;
}

function createLineBadge(lineName, stationName, direction, color, planned, category) {
    const station = stationMap[stationName];

    const lineData = lineCatalog.find(l => l.lineName === lineName);
    const displayName = lineData ? lineData.displayName : lineName;

    // 👉 줄 분리
    const lines = displayName.split("\n");

    // 👉 첫 줄 기준으로 폰트 크기 계산
    const fontSize = getBadgeFontSize(lines[0]);

    const stationKey = stationName;
    if (!stationBadgePositions[stationKey]) stationBadgePositions[stationKey] = [];

    const baseAngle = Math.atan2(direction.y, direction.x);
    const angleOffsets = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.0, -2.0, Math.PI];
    const radiusSteps = [BADGE_BASE_OFFSET, BADGE_BASE_OFFSET + 8, BADGE_BASE_OFFSET + 16, BADGE_BASE_OFFSET + 24, BADGE_BASE_OFFSET + 32];

    let chosenAngle = baseAngle;
    let chosenOffset = BADGE_BASE_OFFSET;
    let cx, cy;

    for (const radius of radiusSteps) {
        for (const offset of angleOffsets) {
            const angle = baseAngle + offset;
            const testCx = station.x + Math.cos(angle) * radius;
            const testCy = station.y + Math.sin(angle) * radius;
            if (isBadgePositionClear(testCx, testCy, stationKey)) {
                chosenAngle = angle;
                chosenOffset = radius;
                cx = testCx;
                cy = testCy;
                break;
            }
        }
        if (cx !== undefined) break;
    }

    if (cx === undefined) {
        chosenAngle = baseAngle;
        chosenOffset = BADGE_BASE_OFFSET + stationBadgePositions[stationKey].length * 8;
        cx = station.x + Math.cos(chosenAngle) * chosenOffset;
        cy = station.y + Math.sin(chosenAngle) * chosenOffset;
    }

    stationBadgePositions[stationKey].push({ cx, cy });
    globalBadgePositions.push({ cx, cy });

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g"),
        circle = document.createElementNS("http://www.w3.org/2000/svg", "circle"),
        text = document.createElementNS("http://www.w3.org/2000/svg", "text");

    circle.setAttribute("cx", String(cx));
    circle.setAttribute("cy", String(cy));
    circle.setAttribute("r", String(BADGE_RADIUS));
    circle.setAttribute("fill", color);
    circle.setAttribute("stroke", "#e2e8f0");
    circle.setAttribute("stroke-width", "3");

    if (planned) {
        circle.setAttribute("stroke-dasharray", "6 4");
    }

    text.setAttribute("x", String(cx));
    text.setAttribute("y", String(cy));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("fill", "#ffffff");
    text.setAttribute("font-weight", "bold");
    text.setAttribute("font-size", String(fontSize));

    // ✅ 핵심: 줄바꿈 렌더링
    lines.forEach((lineText, i) => {
        const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");

        tspan.setAttribute("x", String(cx));
        tspan.setAttribute("dy", i === 0 ? "0" : "1.2em");

        // 👉 폐선예정 줄은 작게 + 회색 처리 (선택)
        if (i > 0) {
            tspan.setAttribute("font-size", String(fontSize * 0.5));
        }

        tspan.textContent = lineText;
        text.appendChild(tspan);
    });

    group.appendChild(circle);
    group.appendChild(text);
    viewport.appendChild(group);

    group.style.cursor = "pointer";
    group.addEventListener("click", () => focusOnLine(lineName));

    badgeElements.push({ element: group, category, stationName, lineName });
}

// Graph and pathfinding
function buildGraph() {
    const graph = {};
    stationList.forEach(station => {
        graph[station.id] = [];
    });
    lines.forEach(line => {
        if (line.planned) return;
        graph[line.from].push({ to: line.to, cost: 1 });
        graph[line.to].push({ to: line.from, cost: 1 });
    });
    return graph;
}

function dijkstra(start, end) {
    const graph = buildGraph();
    if (!graph[start] || !graph[end]) return null;
    const dist = {}, prev = {}, visited = new Set(), queue = [];
    Object.keys(graph).forEach(node => {
        dist[node] = Infinity;
        prev[node] = null;
    });
    dist[start] = 0;
    queue.push({ node: start, cost: 0 });
    while (queue.length) {
        queue.sort((a, b) => a.cost - b.cost);
        const { node } = queue.shift();
        if (visited.has(node)) continue;
        visited.add(node);
        graph[node].forEach(next => {
            if (visited.has(next.to)) return;
            const newCost = dist[node] + next.cost;
            if (newCost < dist[next.to]) {
                dist[next.to] = newCost;
                prev[next.to] = node;
                queue.push({ node: next.to, cost: newCost });
            }
        });
    }
    if (dist[end] === Infinity) return null;
    const path = [];
    let current = end;
    while (current) {
        path.unshift(current);
        current = prev[current];
    }
    return path;
}

function parseViaStations(value) {
    return value.split(",").map(name => name.trim()).filter(Boolean);
}

function buildRoutePath(stationNames) {
    const fullPath = [];
    for (let i = 0; i < stationNames.length - 1; i++) {
        const segment = dijkstra(stationNames[i], stationNames[i + 1]);
        if (!segment) return null;
        if (i === 0) fullPath.push(...segment);
        else fullPath.push(...segment.slice(1));
    }
    return fullPath;
}

// UI and interaction functions
function setResult(message, emphasize = false) {
    resultBox.innerHTML = emphasize ? `<strong>${message}</strong>` : message;
}

function setRegion(message, emphasize = false) {
    regionBox.innerHTML = emphasize ? `<strong>${message}</strong>` : message;
}

lineElements.forEach(({ element, lines }) => {
    const match = lines.some(line => line.lineName === focusedLineName);

    if (match) {
        element.setAttribute("stroke-opacity", "1");
        element.setAttribute("stroke-width", "10");
    } else {
        const anyPlanned = lines.some(l => l.planned);
        element.setAttribute("stroke-opacity", anyPlanned ? "0.22" : "0.15");
        element.setAttribute("stroke-width", "6");
    }
});

function clearHighlights() {
    highlightedPath = null;

    lineElements.forEach(({ element, lines }) => {
        // 대표 라인 하나 선택 (첫 번째)
        const baseLine = lines[0];

        element.setAttribute("stroke", baseLine.color);

        // 하나라도 planned면 점선 상태 유지
        const isPlanned = lines.some(l => l.planned);
        element.setAttribute("stroke-opacity", isPlanned ? "0.9" : "1");

        element.setAttribute("stroke-width", "8");
    });

}

function highlight(path) {
    clearHighlights();
    highlightedPath = path;
    for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        lineElements.forEach(({ element, lines }) => {
            const match = lines.some(line =>
                (line.from === a && line.to === b) ||
                (line.from === b && line.to === a)
            );

            if (match) {
                element.setAttribute("stroke", "#ef4444");
                element.setAttribute("stroke-opacity", "1");
            }
        });
    }
}

function getVisibleStationSet() {
    return new Set(stationList.map(s => s.id));
}

function isCategoryVisible(category) {
    return activeCategories.has(category);
}

function isStationVisibleByFilter(name) {
    const categories = stationCategoryMap[name];
    if (!categories) return true;
    for (const category of categories) {
        if (activeCategories.has(category)) return true;
    }
    return false;
}

function updateVisibility() {
    const visibleStations = getVisibleStationSet();
    const pathStations = highlightedPath ? new Set(highlightedPath) : null;

    lineElements.forEach(({ element, lines }) => {
        const baseLine = lines[0]; // 대표 라인

        const lineActive = lines.some(l => isCategoryVisible(l.category));
        const isPlanned = lines.some(l => l.planned);

        const defaultOpacity = isPlanned
            ? (lineActive ? 0.9 : 0.18)
            : (lineActive ? 1 : 0.18);

        let opacity = defaultOpacity;
        let width = "8";

        if (highlightedPath) {
            const isOnPath = element.getAttribute("stroke") === "#ef4444";
            opacity = isOnPath ? 1 : 0.18;
            width = isOnPath ? "10" : "8";
        }

        else if (focusedLineName) {
            const match = lines.some(l => l.lineName === focusedLineName);

            if (match) {
                opacity = 1;
                width = "10";
            } else {
                opacity = isPlanned ? 0.22 : 0.15;
                width = "6";
            }
        }

        else if (highlightedStation) {
            const touchesStation = lines.some(l =>
                l.from === highlightedStation || l.to === highlightedStation
            );

            opacity = touchesStation ? 1 : 0.18;
        }

        element.setAttribute("stroke-opacity", String(opacity));
        element.setAttribute("stroke-width", width);
    });
    badgeElements.forEach(({ element, stationName, lineName, category }) => {
        const active = isCategoryVisible(category);
        const visible = (!isDenseCoreStation(stationName) || scale >= 1.45 || stationName === highlightedStation || focusedLineName === lineName);
        element.style.display = visible ? "" : "none";
        let opacity = active ? 1 : 0.24;
        if (focusedLineName && lineName !== focusedLineName) opacity = 0.28;
        if (highlightedPath && !pathStations.has(stationName)) opacity = 0.2;
        element.style.opacity = opacity;
    });
    stationElements.forEach(({ name, element }) => {
        const active = isStationVisibleByFilter(name);
        element.style.display = "";
        element.classList.toggle("dimmed", !active);
        element.classList.toggle("highlighted", name === highlightedStation);
        if (highlightedPath && !pathStations.has(name)) {
            element.style.opacity = active ? "0.7" : "0.2";
        } else {
            element.style.opacity = active ? "1" : "0.25";
        }
    });
    labelElements.forEach(({ name, element }) => {
        const active = isStationVisibleByFilter(name);
        const showLabel = !isDenseCoreStation(name) || scale >= 1.2 || name === highlightedStation;
        element.style.display = "";
        element.classList.toggle("dimmed", !active);
        element.classList.toggle("compact", active && !showLabel);
        if (highlightedPath && !pathStations.has(name)) {
            element.style.opacity = active ? "0.7" : "0.2";
        } else {
            element.style.opacity = active ? "1" : "0.25";
        }
    });
    updateLineGroupState();
    updateFilterState();
}

function isLightRailOnlyView() {
    return activeCategories.size === 1 && activeCategories.has("light_rail");
}

function isFocusedLineLightRail() {
    if (!focusedLineName) return false;
    const line = lineCatalog.find(item => item.lineName === focusedLineName);
    return line ? line.category === "light_rail" : false;
}

function focusOnStations(path) {
    const points = path.map(name => stationMap[name]).filter(Boolean);
    if (!points.length) return;
    const minX = Math.min(...points.map(point => point.x)),
        maxX = Math.max(...points.map(point => point.x)),
        minY = Math.min(...points.map(point => point.y)),
        maxY = Math.max(...points.map(point => point.y)),
        width = Math.max(maxX - minX, 120),
        height = Math.max(maxY - minY, 120),
        availableWidth = svg.clientWidth - 140,
        availableHeight = svg.clientHeight - 140;
    scale = Math.max(0.45, Math.min(2.4, Math.min(availableWidth / width, availableHeight / height)));
    if (isLightRailOnlyView() || isFocusedLineLightRail()) {
        scale = Math.min(3, Math.max(scale, 1.5));
    }
    ox = svg.clientWidth / 2 - (minX + maxX) / 2 * scale;
    oy = svg.clientHeight / 2 - (minY + maxY) / 2 * scale;
    update();
}

function focusOnStation(name) {
    const station = stationMap[name];
    if (!station) return;
    focusedLineName = null;
    lineSearchInput.value = "";
    highlightedStation = name;
    ox = svg.clientWidth / 2 - station.x * scale;
    oy = svg.clientHeight / 2 - station.y * scale;
    updateVisibility();
    clearHighlights();
    updateLineGroupState();
    update();
}

function focusOnLine(name) {
    const line = lineCatalog.find(item => item.lineName === name);
    if (!line) {
        setResult("검색한 노선을 찾지 못했습니다.", true);
        return;
    }

    activeCategories.add(line.category);

    const filterInput = categoryFilters.querySelector(`input[value="${line.category}"]`);
    if (filterInput) filterInput.checked = true;

    focusedLineName = name;
    highlightedStation = null;

    updateVisibility();
    clearHighlights();
    focusOnStations(line.stations);

    setResult(
        `<strong>${line.displayName}</strong><br>` +
        `${categoryLabels[line.category]} / ${line.stations.length}개 역<br>` +
        `${line.stations.join(" → ")}`
    );

    updateLineGroupState();
}

function findRoute() {
    const startName = startInput.value.trim(),
        endName = endInput.value.trim(),
        viaNames = parseViaStations(viaInput.value),
        routeNames = [startName, ...viaNames, endName];
    if (!startName || !endName) {
        setResult("출발역과 도착역을 모두 입력해 주세요.", true);
        return;
    }
    const invalidStation = routeNames.find(name => !stationMap[name]);
    if (invalidStation) {
        setResult(`입력한 역을 찾을 수 없습니다: ${invalidStation}`, true);
        return;
    }
    focusedLineName = null;
    lineSearchInput.value = "";
    const path = buildRoutePath(routeNames);
    if (!path) {
        setResult("연결 경로를 찾지 못했습니다. 개통 예정 구간은 경로에서 제외됩니다. 역 이름을 다시 확인해 주세요.", true);
        clearHighlights();
        return;
    }
    highlightedStation = null;
    highlight(path);
    focusOnStations(path);
    const viaText = viaNames.length ? ` / 경유 ${viaNames.join(" → ")}` : "";
    setResult(`최단 경로 ${path.length - 1}구간<br>${startName}${viaText} → ${endName}<br>${path.join(" → ")}`);
    updateVisibility();
}

function resetViewState() {
    scale = 1;
    ox = 0;
    oy = 0;
    highlightedStation = null;
    focusedLineName = null;
    activeCategories.clear();
    availableCategoryEntries.forEach(([key]) => activeCategories.add(key));
    clearHighlights();
    updateVisibility();
    updateLineGroupState();
    updateFilterState();
    update();
    setResult("출발역과 도착역을 입력하면 최단 경로가 여기에 표시됩니다.");
    setRegion("마우스를 올리면 구역 이름이 표시됩니다.");
}

// Rendering functions
function renderStationOptions() {
    stationOptions.innerHTML = stationList.slice().sort((a, b) => a.name.localeCompare(b.name, "ko"))
        .map(station => `<option value="${station.name}"></option>`).join("");
}

function renderCategoryFilters() {
    categoryFilters.innerHTML = availableCategoryEntries.map(([key, label]) => `
        <label class="filter-chip">
            <input type="checkbox" value="${key}" checked>
            <span>${label}</span>
        </label>
    `).join("");
    categoryFilters.querySelectorAll("input[type=checkbox]").forEach(input => {
        input.addEventListener("change", () => {
            if (input.checked) activeCategories.add(input.value);
            else activeCategories.delete(input.value);
            updateVisibility();
        });
    });
}

function updateFilterState() {
    categoryFilters.querySelectorAll("input[type=checkbox]").forEach(input => {
        const category = input.value;
        const visible = activeCategories.has(category);
        input.parentNode.classList.toggle("filtered-out", !visible);
    });
    lineGroups.querySelectorAll(".line-pill").forEach(pill => {
        const visible = activeCategories.has(pill.dataset.category);
        pill.classList.toggle("filtered-out", !visible);
    });
}

/**
 * 역 이름을 기반으로 지역(Region)을 판별하는 함수
 */
/**
 * 역 이름을 기반으로 13개 세부 지역을 판별하는 함수
 */
/**
 * 역 ID를 받아 해당 역의 데이터에 정의된 지역 정보를 반환
 */
function getRegionById(stationId) {
    // stations 데이터에서 [x, y, regionName] 형식을 가져옴
    const stationData = stations[stationId];
    const regionName = stationData ? stationData[2] : "기타";

    // 지역 명칭에 따른 속성 매핑
    const regionMap = {
        "중앙": { id: "central", label: "중앙특별시", color: "rgba(255, 255, 255, 0.1)" },
        "유곽": { id: "yugwak", label: "유곽광역시", color: "rgba(132, 204, 22, 0.15)" },
        "외곽": { id: "outer", label: "외곽군", color: "rgba(100, 116, 139, 0.15)" },
        "폭서": { id: "pogseo", label: "폭서군", color: "rgba(251, 146, 60, 0.15)" },
        "서산": { id: "seosan", label: "서산시", color: "rgba(234, 179, 8, 0.15)" },
        "화북": { id: "hwabuk", label: "화북군", color: "rgba(192, 132, 252, 0.15)" },
        "팔시티": { id: "palcity", label: "팔시티", color: "rgba(56, 189, 248, 0.15)" },
        "북동": { id: "northeast", label: "북동시", color: "rgba(168, 85, 247, 0.15)" },
        "동영": { id: "dongyeong", label: "동영시", color: "rgba(244, 63, 94, 0.15)" },
        "경선": { id: "gyeongseon", label: "경선군", color: "rgba(20, 184, 166, 0.15)" },
        "경인": { id: "gyeongin", label: "경인군", color: "rgba(1, 66, 97, 0.15)" },
        "도서": { id: "doseo", label: "도서광역시", color: "rgba(34, 197, 94, 0.15)" },
        "북시티": { id: "northcity", label: "북시티", color: "rgba(39, 102, 2, 0.15)" },
        "서린": { id: "seorin", label: "서린군", color: "rgba(39, 102, 2, 0.15)" }
    };

    return regionMap[regionName] || { id: "etc", label: "도시 확장구역", color: "rgba(148, 163, 184, 0.05)" };
}

/**
 * 보로노이 다이어그램을 생성하고 같은 지역끼리 경계를 합쳐 출력
 */

function renderRegionalBoundaries() {
    // =========================
    // 1. 지도 전체 bounds 계산 (핵심🔥)
    // =========================
    const xs = stationList.map(s => s.x);
    const ys = stationList.map(s => s.y);

    const minX = Math.min(...xs) - 200;
    const maxX = Math.max(...xs) + 200;
    const minY = Math.min(...ys) - 200;
    const maxY = Math.max(...ys) + 200;

    // 👉 월드 좌표 기준 Voronoi
    const points = stationList.map(s => [s.x, s.y]);
    const delaunay = d3.Delaunay.from(points);
    const voronoi = delaunay.voronoi([minX, minY, maxX, maxY]);

    // =========================
    // 2. 그룹 생성 (viewport 안!)
    // =========================
    let regionGroup = document.getElementById("region-boundaries");

    if (!regionGroup) {
        regionGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        regionGroup.id = "region-boundaries";

        // 🔥 핵심: viewport 안에 넣는다 (같이 움직이게)
        viewport.insertBefore(regionGroup, viewport.firstChild);
    }

    regionGroup.innerHTML = "";

    const regionPaths = {};

    // =========================
    // 3. 안전하게 셀 생성
    // =========================
    stationList.forEach((station, i) => {
        const cell = voronoi.cellPolygon(i);

        if (!cell) return;

        const region = getRegionById(station.id);

        if (!regionPaths[region.id]) {
            regionPaths[region.id] = {
                path: "",
                color: region.color,
                label: region.label
            };
        }

        // 👉 polygon → path 변환
        const pathD = "M" + cell.map(p => p.join(",")).join("L") + "Z";

        regionPaths[region.id].path += " " + pathD;
    });

    // =========================
    // 4. 렌더링
    // =========================
    Object.values(regionPaths).forEach(data => {
        if (!data.path.trim()) return;

        const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");

        pathEl.setAttribute("d", data.path.trim());
        pathEl.setAttribute("fill", data.color);
        pathEl.setAttribute("fill-rule", "evenodd");

        // 👉 너무 진하면 지도 가림
        pathEl.setAttribute("opacity", "0.5");

        pathEl.setAttribute("stroke", "none");

        // 👉 hover 유지 가능
        pathEl.style.pointerEvents = "auto";

        pathEl.addEventListener("mouseenter", () => {
            if (!drag) {
                setRegion(`현재 구역: <strong>${data.label}</strong>`);
            }
        });

        pathEl.addEventListener("mouseleave", () => {
            setRegion("마우스를 올리면 구역 이름이 표시됩니다.");
        });

        regionGroup.appendChild(pathEl);
    });
}

function renderLineOptions() {
    lineOptions.innerHTML = lineCatalog
        .slice()
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"))
        .map(line => `<option value="${line.displayName}"></option>`)
        .join("");
}

function updateLineGroupState() {
    lineGroups.querySelectorAll(".line-pill[data-line]").forEach(pill => {
        const lineName = pill.dataset.line;
        const mismatched = focusedLineName && lineName !== focusedLineName;
        pill.classList.toggle("dimmed", mismatched);
        pill.classList.toggle("active", focusedLineName === lineName);
    });
}

function renderLineGroups() {
    lineGroups.innerHTML = availableCategoryEntries.map(([key, label]) => {
        const groupLines = lineCatalog.filter(line => line.category === key);

        const pills = groupLines.map(line =>
            `<div class="line-pill" data-line="${line.lineName}" data-category="${line.category}">
                <span class="swatch" style="background:${line.colorCss}"></span>
                <span>${line.displayName}</span>
            </div>`
        ).join("");

        return `
        <section class="line-group">
            <h3>${label}</h3>
            <div class="line-list">
                ${pills || '<div class="line-pill">없음</div>'}
            </div>
        </section>`;
    }).join("");

    lineGroups.querySelectorAll(".line-pill[data-line]").forEach(pill => {
        pill.addEventListener("click", () => focusOnLine(pill.dataset.line));
    });

    updateLineGroupState();
}

function update() {
    viewport.setAttribute("transform", `translate(${ox},${oy}) scale(${scale})`);
}

function buildRegionEllipseParams() {
    const byRegion = {};
    stationList.forEach(s => {
        if (!byRegion[s.region]) byRegion[s.region] = [];
        byRegion[s.region].push(s);
    });
    const pad = 72;
    const minR = 128;
    return Object.keys(byRegion).sort((a, b) => a.localeCompare(b, "ko")).map(region => {
        const sts = byRegion[region];
        const xs = sts.map(s => s.x), ys = sts.map(s => s.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        let rx = (maxX - minX) / 2 + pad;
        let ry = (maxY - minY) / 2 + pad;
        rx = Math.max(rx, minR);
        ry = Math.max(ry, minR);
        return {
            region,
            cx: (minX + maxX) / 2,
            cy: (minY + maxY) / 2,
            rx,
            ry
        };
    });
}

// Rendering and initialization
const renderedLines = lines.map(createLineGeometry),
    overlapGroups = renderedLines.map(() => []);
for (let i = 0; i < renderedLines.length; i++) {
    overlapGroups[i].push(i);
    for (let j = 0; j < renderedLines.length; j++) {
        if (i !== j && isOverlappingSegment(renderedLines[i], renderedLines[j])) overlapGroups[i].push(j);
    }
    overlapGroups[i].sort((a, b) => renderedLines[a].lineName !== renderedLines[b].lineName ?
        renderedLines[a].lineName.localeCompare(renderedLines[b].lineName, "ko") : a - b);
}

function groupLinesByColor(indices, renderedLines) {
    const map = new Map();

    indices.forEach(i => {
        const line = renderedLines[i];
        const color = line.color;

        if (!map.has(color)) {
            map.set(color, []);
        }
        map.get(color).push(i);
    });

    return Array.from(map.values());
}

const regionOutlineGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
regionOutlineGroup.setAttribute("class", "region-outlines");
regionOutlineGroup.setAttribute("visibility", "hidden");
regionOutlineGroup.style.pointerEvents = "none";
buildRegionEllipseParams().forEach(({ cx, cy, rx, ry }) => {
    const ell = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    ell.setAttribute("cx", String(cx));
    ell.setAttribute("cy", String(cy));
    ell.setAttribute("rx", String(rx));
    ell.setAttribute("ry", String(ry));
    ell.setAttribute("fill", "none");
    ell.setAttribute("stroke", "#64748b");
    ell.setAttribute("stroke-width", "2.5");
    ell.setAttribute("stroke-opacity", "0.88");
    ell.setAttribute("class", "region-outline");
    regionOutlineGroup.appendChild(ell);
});
viewport.appendChild(regionOutlineGroup);

overlapGroups.forEach((group) => {
    const colorGroups = groupLinesByColor(group, renderedLines);

    colorGroups.forEach((indices, colorIndex) => {
        const baseIndex = indices[0]; // 대표 노선
        const line = renderedLines[baseIndex];

        const points = getRenderedSegmentPoints(
            line,
            colorIndex,
            colorGroups.length
        );

        const el = document.createElementNS("http://www.w3.org/2000/svg", "polyline");

        el.setAttribute(
            "points",
            points.map(([x, y]) => `${x},${y}`).join(" ")
        );

        el.setAttribute("stroke", line.color);
        el.setAttribute("stroke-width", 8);
        el.setAttribute("stroke-linecap", "round");
        el.setAttribute("stroke-linejoin", "round");
        el.setAttribute("fill", "none");

        // 👉 하나라도 planned면 점선 처리
        const isPlanned = indices.some(i => renderedLines[i].planned);
        if (isPlanned) {
            el.setAttribute("stroke-dasharray", "16 12");
            el.setAttribute("stroke-opacity", "0.9");
        }

        viewport.appendChild(el);

        lineElements.push({
            element: el,
            lines: indices.map(i => renderedLines[i]) // 여러 노선 묶음
        });
    });
});

lineCatalog.forEach(line => {
    if (!line.stations || line.stations.length < 2) return;
    const startStation = line.stations[0],
        startNeighbor = line.stations[1],
        endStation = line.stations[line.stations.length - 1],
        endNeighbor = line.stations[line.stations.length - 2],
        startDirection = getUnitVector(startNeighbor, startStation),
        endDirection = getUnitVector(endNeighbor, endStation);
    createLineBadge(line.lineName, startStation, startDirection, line.colorCss, Boolean(line.planned), line.category);
    if (!(line.is_loop && startStation === endStation))
        createLineBadge(line.lineName, endStation, endDirection, line.colorCss, Boolean(line.planned), line.category);
});

stationList.forEach(station => {
    const baseRadius = getStationBaseRadius(station.name);
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", station.x);
    circle.setAttribute("cy", station.y);
    circle.setAttribute("r", baseRadius);
    circle.setAttribute("class", "station");
    circle.setAttribute("stroke", "#22c55e");
    circle.onmouseenter = () => circle.setAttribute("r", Math.min(baseRadius + 4, 14));
    circle.onmouseleave = () => circle.setAttribute("r", baseRadius);
    circle.onclick = () => {
        if (!startInput.value) startInput.value = station.name;
        else if (!endInput.value || endInput.value === station.name) endInput.value = station.name;
        else stationSearchInput.value = station.name;
        highlightedStation = station.name;
        focusOnStation(station.name);
        setResult(`<strong>${station.name}</strong><br>선택한 역으로 지도를 이동했습니다. 출발역과 도착역 입력에도 바로 사용할 수 있습니다.`);
    };
    viewport.appendChild(circle);
    stationElements.push({ name: station.name, element: circle });
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", station.x);
    text.setAttribute("y", station.y + 20);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "label");
    text.textContent = station.name;
    viewport.appendChild(text);
    labelElements.push({ name: station.name, element: text });
});

// Event listeners
const regionOutlinesToggle = document.getElementById("regionOutlinesToggle");
if (regionOutlinesToggle) {
    regionOutlinesToggle.addEventListener("change", () => {
        regionOutlineGroup.setAttribute("visibility", regionOutlinesToggle.checked ? "visible" : "hidden");
    });
}

findRouteBtn.addEventListener("click", findRoute);
resetViewBtn.addEventListener("click", () => {
    startInput.value = "";
    viaInput.value = "";
    endInput.value = "";
    stationSearchInput.value = "";
    resetViewState();
});
stationSearchInput.addEventListener("change", () => {
    const stationName = stationSearchInput.value.trim();
    if (!stationMap[stationName]) {
        setResult("검색한 역을 찾지 못했습니다.", true);
        return;
    }
    focusOnStation(stationName);
    setResult(`<strong>${stationName}</strong><br>지도 중심을 해당 역으로 이동했습니다.`);
});
lineSearchInput.addEventListener("change", () => {
    const input = lineSearchInput.value.trim();
    if (!input) return;

    const found = lineCatalog.find(line =>
        line.lineName === input || line.displayName === input
    );

    if (!found) {
        setResult("검색한 노선을 찾지 못했습니다.", true);
        return;
    }

    focusOnLine(found.lineName);
});

[startInput, viaInput, endInput].forEach(input => {
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            findRoute();
        }
    });
});

// Zoom and pan functions
function clampScale(nextScale) {
    return Math.max(0.45, Math.min(3, nextScale));
}

function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX,
        dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy) || 1;
}

function getTouchCenter(touches) {
    return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
}

function zoomAtPoint(clientX, clientY, nextScale) {
    const bounded = clampScale(nextScale),
        worldX = (clientX - ox) / scale,
        worldY = (clientY - oy) / scale;
    scale = bounded;
    ox = clientX - worldX * scale;
    oy = clientY - worldY * scale;
    update();
}

let pinchDistance = 0;
svg.onmousedown = event => {
    drag = true;
    sx = event.clientX - ox;
    sy = event.clientY - oy;
};
svg.onmousemove = event => {
    if (!drag) return;
    ox = event.clientX - sx;
    oy = event.clientY - sy;
    update();
};
svg.onmouseup = () => { drag = false; };
svg.onmouseleave = () => { drag = false; };
svg.onwheel = event => {
    event.preventDefault();
    zoomAtPoint(event.clientX, event.clientY, scale + (event.deltaY > 0 ? -0.1 : 0.1));
};
svg.addEventListener("touchstart", event => {
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        drag = true;
        sx = touch.clientX - ox;
        sy = touch.clientY - oy;
    } else if (event.touches.length === 2) {
        drag = false;
        pinchDistance = getTouchDistance(event.touches);
    }
}, { passive: false });
svg.addEventListener("touchmove", event => {
    event.preventDefault();
    if (event.touches.length === 1 && drag) {
        const touch = event.touches[0];
        ox = touch.clientX - sx;
        oy = touch.clientY - sy;
        update();
    } else if (event.touches.length === 2) {
        const center = getTouchCenter(event.touches),
            nextDistance = getTouchDistance(event.touches),
            ratio = nextDistance / pinchDistance;
        zoomAtPoint(center.x, center.y, scale * ratio);
        pinchDistance = nextDistance;
    }
}, { passive: false });
svg.addEventListener("touchend", event => {
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        drag = true;
        sx = touch.clientX - ox;
        sy = touch.clientY - oy;
    } else {
        drag = false;
    }
    if (event.touches.length < 2) pinchDistance = 0;
});

// Initial render



renderStationOptions();
renderCategoryFilters();
renderLineOptions();
renderLineGroups();
updateFilterState();

// 초기 실행 루틴에 추가
renderRegionalBoundaries();
updateVisibility();
clearHighlights();
updateLineGroupState();
update();