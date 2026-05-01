const map = L.map('map').setView([34.7466, 113.6254], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const form = document.querySelector('#planForm');
const generateButton = document.querySelector('#generateButton');
const planSummary = document.querySelector('#planSummary');
const routeControls = document.querySelector('#routeControls');
const dayList = document.querySelector('#dayList');

let markerLayer = L.layerGroup().addTo(map);
let routeLayer = L.layerGroup().addTo(map);
let currentPlan = null;
let visibleRoutes = new Set();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.days = Number(payload.days);

  setLoading(true);
  clearPlan();

  try {
    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || '生成失败');
    }
    currentPlan = data;
    renderPlan(data);
  } catch (error) {
    planSummary.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  } finally {
    setLoading(false);
  }
});

function setLoading(isLoading) {
  generateButton.disabled = isLoading;
  generateButton.textContent = isLoading ? '生成中...' : '生成行程';
}

function clearPlan() {
  markerLayer.clearLayers();
  routeLayer.clearLayers();
  visibleRoutes = new Set();
  planSummary.innerHTML = '';
  routeControls.innerHTML = '';
  dayList.innerHTML = '';
}

function renderPlan(plan) {
  planSummary.innerHTML = `<article class="summary-card"><h2>${escapeHtml(plan.title)}</h2><p>${escapeHtml(plan.goal)}</p></article>`;
  renderMarkers(plan);
  renderRouteControls(plan);
  renderDays(plan);
}

function renderMarkers(plan) {
  const bounds = [];
  for (const day of plan.days) {
    for (const stop of day.stops) {
      if (!hasCoordinate(stop)) {
        continue;
      }
      const marker = L.marker([stop.lat, stop.lng]).bindPopup(`<strong>${escapeHtml(stop.name)}</strong><br>${escapeHtml(stop.type)}<br>${escapeHtml(stop.reason)}`);
      markerLayer.addLayer(marker);
      bounds.push([stop.lat, stop.lng]);
    }
  }

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}

function renderRouteControls(plan) {
  routeControls.innerHTML = '<h2>路线</h2>';
  for (const day of plan.days) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'route-toggle';
    button.textContent = `显示第 ${day.day} 天推荐路线`;
    button.addEventListener('click', () => toggleRoute(day, button));
    routeControls.appendChild(button);
  }
}

function renderDays(plan) {
  dayList.innerHTML = plan.days.map(day => `
    <article class="day-card">
      <h3>第 ${day.day} 天：${escapeHtml(day.theme)}</h3>
      <ol class="stop-list">
        ${day.stops.map(stop => `
          <li>
            <span class="stop-type">${escapeHtml(stop.type)}</span>
            <strong>${escapeHtml(stop.name)}</strong><br>
            ${escapeHtml(stop.reason)}
          </li>
        `).join('')}
      </ol>
    </article>
  `).join('');
}

async function toggleRoute(day, button) {
  const key = routeKey(day);
  if (visibleRoutes.has(key)) {
    removeRoute(key);
    visibleRoutes.delete(key);
    button.textContent = `显示第 ${day.day} 天推荐路线`;
    return;
  }

  button.disabled = true;
  button.textContent = `加载第 ${day.day} 天路线...`;
  try {
    const route = await getRecommendedRoute(day);
    drawRoute(key, route);
    visibleRoutes.add(key);
    button.textContent = `隐藏第 ${day.day} 天推荐路线`;
  } catch (error) {
    drawRoute(key, fallbackLine(day));
    visibleRoutes.add(key);
    button.textContent = `隐藏第 ${day.day} 天示意路线`;
  } finally {
    button.disabled = false;
  }
}

async function getRecommendedRoute(day) {
  const key = routeKey(day);
  const cached = localStorage.getItem(key);
  if (cached) {
    return JSON.parse(cached);
  }

  const stops = coordinateStops(day);
  if (stops.length < 2) {
    throw new Error('路线至少需要两个坐标点');
  }

  const coords = stops.map(stop => `${stop.lng},${stop.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?geometries=geojson&overview=full`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json();
    const coordinates = data.routes?.[0]?.geometry?.coordinates;
    if (!response.ok || !Array.isArray(coordinates)) {
      throw new Error('OSRM 路线不可用');
    }
    const route = coordinates.map(([lng, lat]) => [lat, lng]);
    localStorage.setItem(key, JSON.stringify(route));
    return route;
  } finally {
    clearTimeout(timeout);
  }
}

function drawRoute(key, points) {
  removeRoute(key);
  const polyline = L.polyline(points, {
    color: '#ef4444',
    weight: 5,
    opacity: 0.85
  });
  polyline.routeKey = key;
  routeLayer.addLayer(polyline);
}

function removeRoute(key) {
  routeLayer.eachLayer(layer => {
    if (layer.routeKey === key) {
      routeLayer.removeLayer(layer);
    }
  });
}

function fallbackLine(day) {
  return coordinateStops(day).map(stop => [stop.lat, stop.lng]);
}

function coordinateStops(day) {
  return day.stops.filter(hasCoordinate);
}

function hasCoordinate(stop) {
  return Number.isFinite(stop.lat) && Number.isFinite(stop.lng);
}

function routeKey(day) {
  const names = day.stops.map(stop => stop.name).join('|');
  return `route:${currentPlan?.title || 'plan'}:${day.day}:${names}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}
