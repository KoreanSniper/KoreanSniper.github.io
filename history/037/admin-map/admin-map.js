const stationList = Object.entries(stations).map(([name, [x, y, region]]) => ({ name, x, y, region }));

const regionMeta = {
    중앙: {label: "중앙특별시", color: "rgba(255, 255, 255, 0.1)", type: "특별시" },
    유곽: {label: "유곽광역시", color: "rgba(132, 204, 22, 0.15)", type: "광역시" },
    외곽: {label: "외곽군", color: "rgba(100, 116, 139, 0.15)", type: "군" },
    남부도서관: {label: "남부도서관", color: "rgba(34, 197, 94, 0.15)", type: "광역시" },
    폭서: {label: "폭서군", color: "rgba(251, 146, 60, 0.15)", type: "군" },
    서산: {label: "서산시", color: "rgba(234, 179, 8, 0.15)", type: "시" },
    화북: {label: "화북군", color: "rgba(192, 132, 252, 0.15)", type: "군" },
    팔시티: {label: "팔시티", color: "rgba(56, 189, 248, 0.15)", type: "시티" },
    북동: {label: "북동시", color: "rgba(168, 85, 247, 0.15)", type: "시" },
    동영: {label: "동영시", color: "rgba(244, 63, 94, 0.15)", type: "시" },
    경선: {label: "경선군", color: "rgba(20, 184, 166, 0.15)", type: "군" },
    경인: {label: "경인군", color: "rgba(1, 66, 97, 0.15)", type: "군" },
    도서: {label: "도서광역시", color: "rgba(34, 197, 94, 0.15)", type: "광역시" },
    북시티: {label: "북시티", color: "rgba(39, 102, 2, 0.15)", type: "시티" }
};


const regionGroups = stationList.reduce((result, station) => {
    const key = station.region || "기타";
    if (!result[key]) result[key] = [];
    result[key].push(station);
    return result;
}, {});

function getBounds() {
    const xs = stationList.map(s => s.x);
    const ys = stationList.map(s => s.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { minX, minY, maxX, maxY };
}

function updateRegionLegend() {
    const legend = document.getElementById("regionLegend");
    const grouped = { "특별시": [], "시티": [], "광역시": [], "시": [], "군": [] };
    Object.entries(regionMeta).forEach(([region, meta]) => {
        const type = meta.type || "기타";
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push({ region, meta });
    });
    legend.innerHTML = Object.entries(grouped).map(([type, items]) => {
        if (!items.length) return "";
        return `
            <div class="line-group">
                <h3>${type}</h3>
                ${items.map(({ meta }) => `
                    <div class="line-pill" style="border-color: rgba(255,255,255,0.12);">
                        <span class="swatch" style="background:${meta.color};"></span>
                        <span>${meta.label}</span>
                    </div>
                `).join("")}
            </div>
        `;
    }).join("");
}

let scale = 1, ox = 0, oy = 0, drag = false, sx = 0, sy = 0, pinchDistance = 0;
const svg = document.getElementById("map");
const viewport = document.getElementById("viewport");
const zoomInBtn = document.getElementById("zoomIn");
const zoomOutBtn = document.getElementById("zoomOut");
const resetViewBtn = document.getElementById("resetViewBtn");
const hoverRegionInfo = document.getElementById("hoverRegionInfo");

function clampScale(nextScale) {
    return Math.max(0.5, Math.min(3, nextScale));
}

function updateView() {
    viewport.setAttribute("transform", `translate(${ox},${oy}) scale(${scale})`);
}

function zoomAtPoint(clientX, clientY, nextScale) {
    const rect = svg.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const worldX = (localX - ox) / scale;
    const worldY = (localY - oy) / scale;
    scale = clampScale(nextScale);
    ox = localX - worldX * scale;
    oy = localY - worldY * scale;
    updateView();
}

function resetView() {
    scale = 1;
    ox = 0;
    oy = 0;
    updateView();
}

function createRegionMap() {
    const { minX, minY, maxX, maxY } = getBounds();
    const margin = 120;
    const width = maxX - minX + margin * 2;
    const height = maxY - minY + margin * 2;
    svg.setAttribute("viewBox", `${minX - margin} ${minY - margin} ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const points = stationList.map(s => [s.x, s.y]);
    const delaunay = d3.Delaunay.from(points);
    const voronoi = delaunay.voronoi([minX - margin, minY - margin, maxX + margin, maxY + margin]);

    const regionGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const regionPaths = {};

    stationList.forEach((station, index) => {
        const region = station.region || "기타";
        const meta = regionMeta[region] || { label: region, color: "rgba(148,163,184,0.14)" };
        const cellPath = voronoi.renderCell(index);
        if (!cellPath) return;

        if (!regionPaths[region]) {
            regionPaths[region] = { d: "", meta };
        }
        regionPaths[region].d += " " + cellPath;
    });

    Object.entries(regionPaths).forEach(([region, { d, meta }]) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d.trim());
        path.setAttribute("fill", meta.color);
        path.setAttribute("fill-rule", "evenodd");
        path.setAttribute("stroke", "none");
        path.setAttribute("class", "region-cell");
        path.style.cursor = "pointer";

        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = meta.label;
        path.appendChild(title);

        path.addEventListener("mouseenter", () => {
            path.setAttribute("fill", "rgba(255,255,255,0.18)");
            if (hoverRegionInfo) {
                hoverRegionInfo.innerHTML = `<strong>${meta.label}</strong><br>${meta.type || "구역"}`;
            }
        });
        path.addEventListener("mouseleave", () => {
            path.setAttribute("fill", meta.color);
            if (hoverRegionInfo) {
                hoverRegionInfo.textContent = "마우스를 올리면 구역 정보가 표시됩니다.";
            }
        });
        regionGroup.appendChild(path);
    });

    viewport.appendChild(regionGroup);

    const stationGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    stationList.forEach(station => {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", station.x);
        circle.setAttribute("cy", station.y);
        circle.setAttribute("r", "5");
        circle.setAttribute("fill", "transparent");
        circle.setAttribute("stroke", "none");
        circle.setAttribute("opacity", "0.0");
        stationGroup.appendChild(circle);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", station.x + 10);
        text.setAttribute("y", station.y + 4);
        text.setAttribute("fill", "#e2e8f0");
        text.setAttribute("font-size", "12");
        text.setAttribute("class", "label");
        text.setAttribute("pointer-events", "none");
        text.style.userSelect = "none";
        text.textContent = station.name;
        stationGroup.appendChild(text);
    });
    viewport.appendChild(stationGroup);
}

svg.onmousedown = event => {
    drag = true;
    sx = event.clientX - ox;
    sy = event.clientY - oy;
};
svg.onmousemove = event => {
    if (!drag) return;
    ox = event.clientX - sx;
    oy = event.clientY - sy;
    updateView();
};
svg.onmouseup = () => { drag = false; };
svg.onmouseleave = () => { drag = false; };
svg.onwheel = event => {
    event.preventDefault();
    zoomAtPoint(event.clientX, event.clientY, scale + (event.deltaY > 0 ? -0.1 : 0.1));
};
svg.addEventListener("touchstart", event => {
    if (event.touches.length === 1) {
        drag = true;
        sx = event.touches[0].clientX - ox;
        sy = event.touches[0].clientY - oy;
    } else if (event.touches.length === 2) {
        drag = false;
        pinchDistance = Math.hypot(
            event.touches[0].clientX - event.touches[1].clientX,
            event.touches[0].clientY - event.touches[1].clientY
        );
    }
}, { passive: false });
svg.addEventListener("touchmove", event => {
    event.preventDefault();
    if (event.touches.length === 1 && drag) {
        ox = event.touches[0].clientX - sx;
        oy = event.touches[0].clientY - sy;
        updateView();
    } else if (event.touches.length === 2) {
        const newDistance = Math.hypot(
            event.touches[0].clientX - event.touches[1].clientX,
            event.touches[0].clientY - event.touches[1].clientY
        );
        const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        zoomAtPoint(centerX, centerY, scale * (newDistance / pinchDistance));
        pinchDistance = newDistance;
    }
}, { passive: false });
svg.addEventListener("touchend", () => {
    if (drag) drag = false;
    pinchDistance = 0;
});

if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => zoomAtPoint(window.innerWidth / 2, window.innerHeight / 2, scale + 0.2));
}
if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => zoomAtPoint(window.innerWidth / 2, window.innerHeight / 2, scale - 0.2));
}
if (resetViewBtn) {
    resetViewBtn.addEventListener("click", resetView);
}

updateRegionLegend();
createRegionMap();
resetView();