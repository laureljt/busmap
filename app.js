const STORAGE_KEY = "route-planner-state-v2";
const LEGACY_STORAGE_KEY = "route-planner-state-v1";
const AVERAGE_SPEED_MPH = 28;
const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";

const sampleState = {
  locations: [
    {
      id: createId(),
      label: "Home Base",
      address: "100 S High Street",
      city: "Columbus",
      state: "OH",
      lat: 39.961176,
      lng: -82.998794,
      isHome: true,
    },
    {
      id: createId(),
      label: "Maple House",
      address: "82 Maple Street",
      city: "Columbus",
      state: "OH",
      lat: 39.9867,
      lng: -83.0312,
      isHome: false,
    },
    {
      id: createId(),
      label: "North Ridge",
      address: "709 Ridge Road",
      city: "Columbus",
      state: "OH",
      lat: 40.0411,
      lng: -82.9824,
      isHome: false,
    },
    {
      id: createId(),
      label: "Lakeside",
      address: "16 Lakeview Drive",
      city: "Columbus",
      state: "OH",
      lat: 39.9738,
      lng: -82.9186,
      isHome: false,
    },
    {
      id: createId(),
      label: "Oak Terrace",
      address: "230 Oak Terrace",
      city: "Columbus",
      state: "OH",
      lat: 39.9111,
      lng: -83.0254,
      isHome: false,
    },
  ],
  routeOrder: [],
  mapboxToken: "",
  startTime: "",
};

let state = loadState();
let draggedId = null;
let mapboxMap = null;
let mapboxReady = false;
let mapboxMarkers = [];
let drivingRoute = {
  key: "",
  status: "idle",
  data: null,
  error: "",
};
let siteMapboxToken = "";

const screens = {
  addresses: document.querySelector("#addressesScreen"),
  route: document.querySelector("#routeScreen"),
  summary: document.querySelector("#summaryScreen"),
  admin: document.querySelector("#adminScreen"),
};

const elements = {
  navTabs: document.querySelectorAll(".nav-tab"),
  form: document.querySelector("#locationForm"),
  formTitle: document.querySelector("#formTitle"),
  editingId: document.querySelector("#editingId"),
  label: document.querySelector("#labelInput"),
  address: document.querySelector("#addressInput"),
  city: document.querySelector("#cityInput"),
  stateInput: document.querySelector("#stateInput"),
  lat: document.querySelector("#latInput"),
  lng: document.querySelector("#lngInput"),
  home: document.querySelector("#homeInput"),
  cancelEdit: document.querySelector("#cancelEditButton"),
  addAddress: document.querySelector("#addAddressButton"),
  appShell: document.querySelector(".app-shell"),
  sidebar: document.querySelector(".sidebar"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  addressLayout: document.querySelector(".address-layout"),
  addressLayoutResizer: document.querySelector("#addressLayoutResizer"),
  addressSearch: document.querySelector("#addressSearchInput"),
  addressList: document.querySelector("#addressList"),
  routeList: document.querySelector("#routeList"),
  mapPanel: document.querySelector(".map-panel"),
  mapboxMap: document.querySelector("#mapboxMap"),
  routeMap: document.querySelector("#routeMap"),
  mapMessage: document.querySelector("#mapMessage"),
  optimize: document.querySelector("#optimizeButton"),
  reverse: document.querySelector("#reverseButton"),
  routeDistance: document.querySelector("#routeDistance"),
  routeTime: document.querySelector("#routeTime"),
  startTime: document.querySelector("#startTimeInput"),
  metricStops: document.querySelector("#metricStops"),
  metricTime: document.querySelector("#metricTime"),
  homeBaseLabel: document.querySelector("#homeBaseLabel"),
  summaryHome: document.querySelector("#summaryHome"),
  summaryStops: document.querySelector("#summaryStops"),
  summaryDistance: document.querySelector("#summaryDistance"),
  summaryTime: document.querySelector("#summaryTime"),
  summaryRoute: document.querySelector("#summaryRoute"),
  emptyTemplate: document.querySelector("#emptyStateTemplate"),
  mapboxToken: document.querySelector("#mapboxTokenInput"),
  saveToken: document.querySelector("#saveTokenButton"),
  adminStatus: document.querySelector("#adminStatus"),
  bulkInput: document.querySelector("#bulkInput"),
  bulkImport: document.querySelector("#bulkImportButton"),
  bulkSample: document.querySelector("#bulkSampleButton"),
  bulkStatus: document.querySelector("#bulkStatus"),
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!saved) {
    const seeded = { ...sampleState };
    seeded.routeOrder = optimizeRoute(seeded.locations).map((location) => location.id);
    return seeded;
  }

  try {
    const parsed = JSON.parse(saved);
    const locations = Array.isArray(parsed.locations) ? parsed.locations.map(normalizeLocation) : [];
    return {
      locations,
      routeOrder: Array.isArray(parsed.routeOrder) ? parsed.routeOrder : [],
      mapboxToken: typeof parsed.mapboxToken === "string" ? parsed.mapboxToken : "",
      startTime: typeof parsed.startTime === "string" ? parsed.startTime : "",
    };
  } catch {
    return sampleState;
  }
}

function normalizeLocation(location) {
  const normalized = { ...location };
  if (typeof normalized.included !== "boolean") {
    normalized.included = !normalized.isHome;
  }
  if (!Number.isFinite(Number(normalized.lat)) || !Number.isFinite(Number(normalized.lng))) {
    const projected = xyToLngLat(Number(normalized.x), Number(normalized.y));
    normalized.lat = projected.lat;
    normalized.lng = projected.lng;
  }
  delete normalized.x;
  delete normalized.y;
  return normalized;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function loadSiteConfig() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) return;
    const config = await response.json();
    if (typeof config.mapboxToken === "string" && config.mapboxToken.trim()) {
      siteMapboxToken = config.mapboxToken.trim();
      if (!state.mapboxToken) {
        state.mapboxToken = siteMapboxToken;
      }
    }
  } catch {
    siteMapboxToken = "";
  }
}

function getHome() {
  return state.locations.find((location) => location.isHome) || null;
}

function getStops() {
  return state.locations.filter((location) => !location.isHome);
}

function getIncludedStops() {
  return getOrderedStops().filter((location) => location.included !== false);
}

function getOrderedStops() {
  const stops = getStops();
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const ordered = state.routeOrder.map((id) => byId.get(id)).filter(Boolean);
  const missing = stops.filter((stop) => !state.routeOrder.includes(stop.id));
  return [...ordered, ...missing];
}

function getRoute() {
  const home = getHome();
  const stops = getIncludedStops();
  if (!home) return [];
  return stops.length ? [home, ...stops, home] : [home];
}

function syncRouteOrder() {
  const stopIds = new Set(getStops().map((stop) => stop.id));
  const filtered = state.routeOrder.filter((id) => stopIds.has(id));
  const missing = getStops()
    .filter((stop) => !filtered.includes(stop.id))
    .map((stop) => stop.id);
  state.routeOrder = [...filtered, ...missing];
}

function distanceBetween(a, b) {
  if (hasCoordinates(a) && hasCoordinates(b)) {
    return haversineMiles(a.lat, a.lng, b.lat, b.lng);
  }

  return 0;
}

function haversineMiles(latA, lngA, latB, lngB) {
  const earthRadiusMiles = 3958.8;
  const dLat = degreesToRadians(latB - latA);
  const dLng = degreesToRadians(lngB - lngA);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degreesToRadians(latA)) *
      Math.cos(degreesToRadians(latB)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function routeMetrics() {
  const driving = getActiveDrivingRoute();
  if (driving) {
    return {
      distance: metersToMiles(driving.distanceMeters),
      minutes: secondsToMinutes(driving.durationSeconds),
      source: "driving",
    };
  }

  const route = getRoute();
  if (route.length < 2) {
    return { distance: 0, minutes: 0, source: "estimate" };
  }

  const distance = route.slice(1).reduce((sum, location, index) => {
    return sum + distanceBetween(route[index], location);
  }, 0);
  const minutes = Math.round((distance / AVERAGE_SPEED_MPH) * 60);

  return { distance, minutes, source: "estimate" };
}

function getLegMetric(from, to, legIndex = -1) {
  const driving = getActiveDrivingRoute();
  const drivingLeg = driving?.legs?.[legIndex];
  if (drivingLeg) {
    return {
      distance: metersToMiles(drivingLeg.distanceMeters),
      minutes: secondsToMinutes(drivingLeg.durationSeconds),
      source: "driving",
    };
  }

  if (!from || !to) return { distance: 0, minutes: 0 };
  const distance = distanceBetween(from, to);
  return {
    distance,
    minutes: Math.max(1, Math.round((distance / AVERAGE_SPEED_MPH) * 60)),
    source: "estimate",
  };
}

function optimizeRoute(locations = state.locations) {
  const home = locations.find((location) => location.isHome);
  const stops = locations.filter((location) => !location.isHome && location.included !== false);
  if (!home) return stops;

  const unvisited = [...stops];
  const route = [];
  let current = home;

  while (unvisited.length) {
    unvisited.sort((a, b) => distanceBetween(current, a) - distanceBetween(current, b));
    const next = unvisited.shift();
    route.push(next);
    current = next;
  }

  return improveRoute(home, route);
}

function improveRoute(home, route) {
  let best = [...route];
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i += 1) {
      for (let k = i + 1; k < best.length; k += 1) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        if (routeLength(home, candidate) < routeLength(home, best)) {
          best = candidate;
          improved = true;
        }
      }
    }
  }

  return best;
}

function buildOptimizedOrder() {
  const optimizedIds = optimizeRoute().map((location) => location.id);
  const excludedIds = getOrderedStops()
    .filter((location) => location.included === false)
    .map((location) => location.id);
  return [...optimizedIds, ...excludedIds];
}

function buildReversedIncludedOrder() {
  const includedIds = getIncludedStops()
    .map((stop) => stop.id)
    .reverse();
  const excludedIds = getOrderedStops()
    .filter((location) => location.included === false)
    .map((location) => location.id);
  return [...includedIds, ...excludedIds];
}

function routeLength(home, stops) {
  if (!home) return 0;
  const route = [home, ...stops, home];
  return route.slice(1).reduce((sum, stop, index) => sum + distanceBetween(route[index], stop), 0);
}

function formatDistance(distance) {
  return `${distance.toFixed(distance >= 10 ? 0 : 1)} mi`;
}

function formatTime(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function parseStartTime() {
  if (!state.startTime) return null;
  const [hours, minutes] = state.startTime.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function formatClock(totalMinutes) {
  const minutesInDay = 24 * 60;
  const normalized = ((Math.round(totalMinutes) % minutesInDay) + minutesInDay) % minutesInDay;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function getArrivalTime(legIndex) {
  const start = parseStartTime();
  if (start === null) return "";
  if (legIndex === null) return formatClock(start);

  let elapsed = 0;
  for (let index = 0; index <= legIndex; index += 1) {
    const leg = getLegMetricForIndex(index);
    elapsed += leg.minutes;
  }
  return formatClock(start + elapsed);
}

function getLegMetricForIndex(legIndex) {
  const route = getRoute();
  const from = route[legIndex];
  const to = route[legIndex + 1];
  return getLegMetric(from, to, legIndex);
}

function metersToMiles(meters) {
  return meters / 1609.344;
}

function secondsToMinutes(seconds) {
  return Math.max(1, Math.round(seconds / 60));
}

function fullAddress(location) {
  return [location.address, location.city, location.state].filter(Boolean).join(", ");
}

function setScreen(name) {
  Object.entries(screens).forEach(([screenName, node]) => {
    node.classList.toggle("active", screenName === name);
  });
  elements.navTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.screen === name);
  });

  if (name === "route") {
    setTimeout(() => {
      if (mapboxMap) mapboxMap.resize();
      renderMap();
    }, 80);
  }
}

function resetForm() {
  elements.form.reset();
  elements.editingId.value = "";
  elements.formTitle.textContent = "Add an address";
  elements.cancelEdit.classList.add("hidden");
  elements.lat.value = "";
  elements.lng.value = "";
}

function renderAddresses() {
  elements.addressList.innerHTML = "";
  const home = getHome();
  const query = elements.addressSearch.value.trim().toLowerCase();
  elements.homeBaseLabel.textContent = home ? `Home: ${home.label}` : "No home base";

  if (!state.locations.length) {
    elements.addressList.append(elements.emptyTemplate.content.cloneNode(true));
    return;
  }

  const visibleLocations = query
    ? state.locations.filter((location) => addressSearchText(location).includes(query))
    : state.locations;

  if (!visibleLocations.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<strong>No matches</strong><span>Try a different name, street, city, or coordinate.</span>`;
    elements.addressList.append(empty);
    return;
  }

  visibleLocations.forEach((location) => {
    const card = document.createElement("article");
    card.className = "address-card";
    card.innerHTML = `
      <div>
        <h4>${escapeHtml(location.label)} ${
          location.isHome ? '<span class="home-pill">Home</span>' : ""
        }</h4>
        <p>${escapeHtml(fullAddress(location))}</p>
        <p>${formatCoordinates(location)}</p>
      </div>
      <div class="card-actions">
        <button class="icon-button" type="button" data-action="edit" data-id="${location.id}">Edit</button>
        <button class="icon-button danger" type="button" data-action="delete" data-id="${location.id}">Delete</button>
      </div>
    `;
    elements.addressList.append(card);
  });
}

function renderAdmin() {
  elements.mapboxToken.value = state.mapboxToken === siteMapboxToken ? "" : state.mapboxToken || "";
  elements.mapboxToken.placeholder = siteMapboxToken ? "Using site token" : "pk...";
  elements.adminStatus.textContent = state.mapboxToken ? "Mapbox token active" : "No token saved";
}

function addressSearchText(location) {
  return [
    location.label,
    location.address,
    location.city,
    location.state,
    fullAddress(location),
    formatCoordinates(location),
  ]
    .join(" ")
    .toLowerCase();
}

function renderRouteList() {
  elements.routeList.innerHTML = "";
  const home = getHome();
  const stops = getOrderedStops();
  const includedStops = getIncludedStops();

  if (!home) {
    elements.routeList.append(emptyRoute("Set a home base before building a route."));
    return;
  }

  if (!stops.length) {
    elements.routeList.append(emptyRoute("Add at least one address to see the route."));
    return;
  }

  const route = [home, ...includedStops, home];
  elements.routeList.append(routeItem(home, "H", true, "Start home", null, -1, true, getArrivalTime(null)));
  stops.forEach((stop) => {
    const includedIndex = includedStops.findIndex((includedStop) => includedStop.id === stop.id);
    const isIncluded = includedIndex >= 0;
    const previousLocation = isIncluded ? route[includedIndex] : null;
    const arrival = isIncluded ? getArrivalTime(includedIndex) : "";
    elements.routeList.append(
      routeItem(
        stop,
        isIncluded ? String(includedIndex + 1) : "Off",
        false,
        "",
        previousLocation,
        includedIndex,
        isIncluded,
        arrival,
      ),
    );
  });
  if (includedStops.length) {
    elements.routeList.append(
      routeItem(
        home,
        "H",
        true,
        "Return home",
        includedStops.at(-1),
        includedStops.length,
        true,
        getArrivalTime(includedStops.length),
      ),
    );
  }
}

function emptyRoute(message) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.innerHTML = `<strong>Route unavailable</strong><span>${escapeHtml(message)}</span>`;
  return node;
}

function routeItem(
  location,
  index,
  isHome,
  overrideLabel = "",
  previousLocation = null,
  legIndex = -1,
  isIncluded = true,
  arrivalTime = "",
) {
  const item = document.createElement("div");
  item.className = `route-item ${isHome ? "route-home" : ""} ${!isIncluded ? "route-excluded" : ""}`;
  item.draggable = !isHome;
  item.dataset.id = location.id;
  const leg = previousLocation ? getLegMetric(previousLocation, location, legIndex) : null;
  const timeLabel = !isIncluded ? "excluded" : arrivalTime || "set start";
  const legTimeLabel = !isIncluded ? "off route" : leg ? formatTime(leg.minutes) : "start";
  item.innerHTML = `
    <span class="route-index">${index}</span>
    ${
      isHome
        ? '<span class="include-spacer"></span>'
        : `<label class="route-include" title="Include in route">
            <input type="checkbox" data-action="toggle-include" data-id="${location.id}" ${
              isIncluded ? "checked" : ""
            } />
          </label>`
    }
    <span class="route-copy">
      <strong>${escapeHtml(overrideLabel || location.label)}</strong>
      <span>${escapeHtml(fullAddress(location))}</span>
    </span>
    <span class="leg-metric">
      <strong>${leg ? formatDistance(leg.distance) : "-"}</strong>
      <span>${legTimeLabel}</span>
      <em>${timeLabel}</em>
    </span>
    ${
      isHome
        ? '<span class="route-row-actions"></span>'
        : `<span class="route-row-actions">
            <button class="mini-button mobile-reorder" type="button" data-action="move-up" data-id="${location.id}" title="Move up">Up</button>
            <button class="mini-button mobile-reorder" type="button" data-action="move-down" data-id="${location.id}" title="Move down">Down</button>
            <button class="mini-button" type="button" data-action="move-top" data-id="${location.id}" title="Move under home base">Top</button>
            <button class="mini-button" type="button" data-action="move-bottom" data-id="${location.id}" title="Move to bottom">Bottom</button>
          </span>`
    }
  `;

  if (!isHome) {
    item.addEventListener("dragstart", handleDragStart);
    item.addEventListener("dragover", handleDragOver);
    item.addEventListener("drop", handleDrop);
    item.addEventListener("dragend", handleDragEnd);
  }

  return item;
}

function renderMap() {
  const route = getRoute();
  const usableRoute = route.filter(hasCoordinates);

  if (canUseMapbox() && usableRoute.length >= 3) {
    requestDrivingRoute(usableRoute);
    renderMapboxMap(usableRoute);
    return;
  }

  if (mapboxMap) {
    mapboxMap.remove();
    mapboxMap = null;
    mapboxReady = false;
    mapboxMarkers = [];
  }
  elements.mapPanel.classList.remove("mapbox-active");
  elements.mapMessage.textContent = state.mapboxToken
    ? "Mapbox is unavailable, so the app is using the coordinate preview."
    : "Add a Mapbox token to show streets and houses under the route overlay.";
  renderFallbackMap(usableRoute);
}

function routeSignature(route) {
  return route
    .map((location) => `${location.id}:${Number(location.lng).toFixed(6)},${Number(location.lat).toFixed(6)}`)
    .join("|");
}

function getActiveDrivingRoute() {
  if (!state.mapboxToken) return null;
  const route = getRoute().filter(hasCoordinates);
  const key = routeSignature(route);
  if (drivingRoute.key === key && drivingRoute.status === "ready") {
    return drivingRoute.data;
  }
  return null;
}

function requestDrivingRoute(route) {
  const key = routeSignature(route);
  if (route.length > 25) {
    drivingRoute = {
      key,
      status: "error",
      data: null,
      error: "Mapbox Directions supports up to 25 route points, so these metrics are estimated.",
    };
    return;
  }

  if (drivingRoute.key === key && (drivingRoute.status === "loading" || drivingRoute.status === "ready")) {
    return;
  }

  drivingRoute = { key, status: "loading", data: null, error: "" };
  fetchDrivingRoute(route, key);
}

async function fetchDrivingRoute(route, key) {
  const coordinates = route.map((location) => `${location.lng},${location.lat}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(
    state.mapboxToken,
  )}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Mapbox Directions returned ${response.status}`);
    }
    const data = await response.json();
    const routeResult = data.routes?.[0];
    if (!routeResult) {
      throw new Error("Mapbox Directions did not return a route.");
    }

    drivingRoute = {
      key,
      status: "ready",
      error: "",
      data: {
        distanceMeters: routeResult.distance || 0,
        durationSeconds: routeResult.duration || 0,
        geometry: routeResult.geometry?.coordinates || [],
        legs: (routeResult.legs || []).map((leg) => ({
          distanceMeters: leg.distance || 0,
          durationSeconds: leg.duration || 0,
        })),
      },
    };
  } catch (error) {
    drivingRoute = {
      key,
      status: "error",
      data: null,
      error: "Mapbox Directions could not calculate this route, so these metrics are estimated.",
    };
  }

  render();
}

function canUseMapbox() {
  return Boolean(state.mapboxToken && window.mapboxgl);
}

function renderMapboxMap(route) {
  elements.mapPanel.classList.add("mapbox-active");
  elements.mapMessage.textContent = "";
  window.mapboxgl.accessToken = state.mapboxToken;

  if (!mapboxMap) {
    mapboxMap = new window.mapboxgl.Map({
      container: elements.mapboxMap,
      style: MAPBOX_STYLE,
      center: [route[0].lng, route[0].lat],
      zoom: 11,
    });
    mapboxMap.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapboxMap.on("load", () => {
      mapboxReady = true;
      updateMapboxRoute(route);
    });
    mapboxMap.on("error", () => {
      elements.mapMessage.textContent = "Mapbox could not load with the saved token.";
    });
    return;
  }

  if (mapboxReady) {
    updateMapboxRoute(route);
  }
}

function updateMapboxRoute(route) {
  clearMapboxMarkers();
  const driving = getActiveDrivingRoute();
  const waypointCoordinates = route.map((location) => [location.lng, location.lat]);
  const lineCoordinates = driving?.geometry || waypointCoordinates;
  const geojson = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: lineCoordinates,
    },
  };

  if (mapboxMap.getSource("route-line")) {
    mapboxMap.getSource("route-line").setData(geojson);
  } else {
    mapboxMap.addSource("route-line", { type: "geojson", data: geojson });
    mapboxMap.addLayer({
      id: "route-line-shadow",
      type: "line",
      source: "route-line",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.84 },
    });
    mapboxMap.addLayer({
      id: "route-line",
      type: "line",
      source: "route-line",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#0f8b8d", "line-width": 5 },
    });
  }

  route.slice(0, -1).forEach((location, index) => {
    const markerElement = document.createElement("div");
    markerElement.className = `map-marker ${location.isHome ? "home" : ""}`;
    markerElement.textContent = location.isHome ? "H" : String(index);
    const marker = new window.mapboxgl.Marker({ element: markerElement })
      .setLngLat([location.lng, location.lat])
      .setPopup(new window.mapboxgl.Popup({ offset: 22 }).setText(`${location.label}: ${fullAddress(location)}`))
      .addTo(mapboxMap);
    mapboxMarkers.push(marker);
  });

  const bounds = lineCoordinates.reduce(
    (box, coordinate) => box.extend(coordinate),
    new window.mapboxgl.LngLatBounds(lineCoordinates[0], lineCoordinates[0]),
  );
  mapboxMap.fitBounds(bounds, { padding: 74, duration: 450, maxZoom: 15 });

  if (driving) {
    elements.mapMessage.textContent = "Driving distance and time from Mapbox Directions.";
  } else if (drivingRoute.status === "loading") {
    elements.mapMessage.textContent = "Calculating driving distance and time...";
  } else if (drivingRoute.error) {
    elements.mapMessage.textContent = drivingRoute.error;
  }
}

function clearMapboxMarkers() {
  mapboxMarkers.forEach((marker) => marker.remove());
  mapboxMarkers = [];
}

function renderFallbackMap(route) {
  const svg = elements.routeMap;
  svg.innerHTML = `
    <defs>
      <filter id="pointShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#101828" flood-opacity="0.24" />
      </filter>
    </defs>
  `;

  if (route.length < 2) {
    svg.setAttribute("viewBox", "0 0 100 100");
    const text = svgNode("text", { x: 50, y: 50, class: "map-empty" });
    text.textContent = "Add stops and set a home base";
    svg.append(text);
    return;
  }

  const points = projectRouteToCanvas(route);
  svg.setAttribute("viewBox", "0 0 100 100");

  const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");
  svg.append(svgNode("polyline", { points: pointString, class: "map-line-shadow" }));
  svg.append(svgNode("polyline", { points: pointString, class: "map-line" }));

  route.slice(0, -1).forEach((location, index) => {
    const point = points[index];
    const isHome = location.isHome;
    const circle = svgNode("circle", {
      cx: point.x,
      cy: point.y,
      r: isHome ? 2.3 : 1.9,
      fill: isHome ? "#f2a541" : "#0f8b8d",
      class: "map-point",
      filter: "url(#pointShadow)",
    });
    const label = svgNode("text", {
      x: point.x + 2.8,
      y: point.y - 2.4,
      class: "map-label",
    });
    label.textContent = isHome ? "Home" : `${index}`;
    svg.append(circle, label);
  });
}

function xyToLngLat(x, y) {
  const safeX = Number.isFinite(x) ? x : 50;
  const safeY = Number.isFinite(y) ? y : 50;
  return {
    lng: -83.08 + safeX * 0.0016,
    lat: 40.04 - safeY * 0.0016,
  };
}

function projectRouteToCanvas(route) {
  const minLng = Math.min(...route.map((location) => location.lng));
  const maxLng = Math.max(...route.map((location) => location.lng));
  const minLat = Math.min(...route.map((location) => location.lat));
  const maxLat = Math.max(...route.map((location) => location.lat));
  const lngRange = Math.max(maxLng - minLng, 0.01);
  const latRange = Math.max(maxLat - minLat, 0.01);

  return route.map((location) => ({
    x: 14 + ((location.lng - minLng) / lngRange) * 72,
    y: 86 - ((location.lat - minLat) / latRange) * 72,
  }));
}

function svgNode(tag, attributes) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function renderSummary() {
  const home = getHome();
  const stops = getIncludedStops();
  const metrics = routeMetrics();

  elements.summaryHome.textContent = home ? home.label : "Not set";
  elements.summaryStops.textContent = String(stops.length);
  elements.summaryDistance.textContent = formatDistance(metrics.distance);
  elements.summaryTime.textContent = formatTime(metrics.minutes);
  elements.summaryRoute.innerHTML = "";

  if (!home) {
    const item = document.createElement("li");
    item.textContent = "Set a home base to generate a route.";
    elements.summaryRoute.append(item);
    return;
  }

  [home, ...stops, home].forEach((location, index, route) => {
    const item = document.createElement("li");
    item.textContent =
      index === route.length - 1 ? `Return to ${location.label}` : `${location.label} - ${fullAddress(location)}`;
    elements.summaryRoute.append(item);
  });
}

function renderMetrics() {
  const metrics = routeMetrics();
  const stops = getIncludedStops();
  elements.startTime.value = state.startTime || "";
  elements.metricStops.textContent = String(stops.length);
  elements.metricTime.textContent = formatTime(metrics.minutes);
  elements.routeDistance.textContent = formatDistance(metrics.distance);
  elements.routeTime.textContent = formatTime(metrics.minutes);
}

function render() {
  syncRouteOrder();
  renderAddresses();
  renderRouteList();
  renderMap();
  renderSummary();
  renderAdmin();
  renderMetrics();
  saveState();
}

async function handleSubmit(event) {
  event.preventDefault();
  const id = elements.editingId.value || createId();
  const isHome = elements.home.checked;
  const nextLocation = {
    id,
    label: elements.label.value.trim(),
    address: elements.address.value.trim(),
    city: elements.city.value.trim(),
    state: elements.stateInput.value.trim().toUpperCase(),
    lat: optionalCoordinate(elements.lat.value, -90, 90),
    lng: optionalCoordinate(elements.lng.value, -180, 180),
    isHome,
    included: isHome ? false : state.locations.find((location) => location.id === id)?.included !== false,
  };

  if (!hasCoordinates(nextLocation)) {
    if (!state.mapboxToken) {
      elements.bulkStatus.textContent = "Save a Mapbox token before adding addresses without coordinates";
      return;
    }

    elements.bulkStatus.textContent = "Finding coordinates for address...";
    const geocoded = await geocodeLocation(nextLocation);
    if (!geocoded) {
      elements.bulkStatus.textContent = "Could not find coordinates for that address";
      return;
    }
    applyGeocodeResult(nextLocation, geocoded);
  }

  if (isHome) {
    state.locations = state.locations.map((location) => ({ ...location, isHome: false }));
  }

  const existingIndex = state.locations.findIndex((location) => location.id === id);
  if (existingIndex >= 0) {
    state.locations[existingIndex] = nextLocation;
  } else {
    state.locations.push(nextLocation);
  }

  if (!getHome() && state.locations.length) {
    state.locations[0].isHome = true;
  }

  resetForm();
  elements.bulkStatus.textContent = "Address saved with calculated coordinates";
  render();
}

function editLocation(id) {
  const location = state.locations.find((item) => item.id === id);
  if (!location) return;

  elements.editingId.value = location.id;
  elements.label.value = location.label;
  elements.address.value = location.address;
  elements.city.value = location.city;
  elements.stateInput.value = location.state;
  elements.lat.value = location.lat;
  elements.lng.value = location.lng;
  elements.home.checked = location.isHome;
  elements.formTitle.textContent = "Edit address";
  elements.cancelEdit.classList.remove("hidden");
  elements.label.focus();
}

function deleteLocation(id) {
  state.locations = state.locations.filter((location) => location.id !== id);
  state.routeOrder = state.routeOrder.filter((routeId) => routeId !== id);
  if (!getHome() && state.locations.length) {
    state.locations[0].isHome = true;
  }
  render();
}

function handleAddressAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "edit") editLocation(id);
  if (action === "delete") deleteLocation(id);
}

function handleDragStart(event) {
  draggedId = event.currentTarget.dataset.id;
  event.currentTarget.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleDrop(event) {
  event.preventDefault();
  const targetId = event.currentTarget.dataset.id;
  if (!draggedId || draggedId === targetId) return;

  const order = getOrderedStops().map((stop) => stop.id);
  const fromIndex = order.indexOf(draggedId);
  const toIndex = order.indexOf(targetId);
  order.splice(fromIndex, 1);
  order.splice(toIndex, 0, draggedId);
  state.routeOrder = order;
  render();
}

function handleDragEnd(event) {
  event.currentTarget.classList.remove("dragging");
  draggedId = null;
}

function handleRouteAction(event) {
  const checkbox = event.target.closest('input[data-action="toggle-include"]');
  if (checkbox) {
    const location = state.locations.find((item) => item.id === checkbox.dataset.id);
    if (location) {
      location.included = checkbox.checked;
      render();
    }
    return;
  }

  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "move-top") {
    moveStop(button.dataset.id, "top");
  }
  if (button.dataset.action === "move-bottom") {
    moveStop(button.dataset.id, "bottom");
  }
  if (button.dataset.action === "move-up") {
    moveStopByOffset(button.dataset.id, -1);
  }
  if (button.dataset.action === "move-down") {
    moveStopByOffset(button.dataset.id, 1);
  }
}

function moveStop(id, position) {
  const order = getOrderedStops()
    .map((stop) => stop.id)
    .filter((stopId) => stopId !== id);
  if (position === "top") {
    state.routeOrder = [id, ...order];
  } else {
    state.routeOrder = [...order, id];
  }
  render();
}

function moveStopByOffset(id, offset) {
  const order = getOrderedStops().map((stop) => stop.id);
  const currentIndex = order.indexOf(id);
  if (currentIndex < 0) return;
  const nextIndex = Math.min(Math.max(currentIndex + offset, 0), order.length - 1);
  if (nextIndex === currentIndex) return;
  order.splice(currentIndex, 1);
  order.splice(nextIndex, 0, id);
  state.routeOrder = order;
  render();
}

function updateStartTime() {
  state.startTime = elements.startTime.value;
  render();
}

function saveMapboxToken() {
  state.mapboxToken = elements.mapboxToken.value.trim();
  if (!state.mapboxToken && siteMapboxToken) {
    state.mapboxToken = siteMapboxToken;
  }
  drivingRoute = { key: "", status: "idle", data: null, error: "" };
  if (mapboxMap) {
    mapboxMap.remove();
    mapboxMap = null;
    mapboxReady = false;
    mapboxMarkers = [];
  }
  elements.adminStatus.textContent = state.mapboxToken ? "Mapbox token active" : "Mapbox token cleared";
  render();
}

async function handleBulkImport() {
  const rows = parseBulkAddresses(elements.bulkInput.value);
  if (!rows.length) {
    elements.bulkStatus.textContent = "No valid rows found";
    return;
  }

  elements.bulkStatus.textContent = `Importing ${rows.length} row${rows.length === 1 ? "" : "s"}...`;
  const imported = [];
  for (const row of rows) {
    const location = {
      id: createId(),
      label: row.label,
      address: row.address,
      city: row.city,
      state: row.state,
      lat: row.lat,
      lng: row.lng,
      isHome: row.isHome,
      included: !row.isHome,
    };

    if (!hasCoordinates(location) && state.mapboxToken) {
      const geocoded = await geocodeLocation(location);
      if (geocoded) {
        applyGeocodeResult(location, geocoded);
      }
    }

    if (!hasCoordinates(location)) {
      elements.bulkStatus.textContent =
        "Save a Mapbox token before importing address-only rows, or add coordinates manually.";
      return;
    }

    imported.push(location);
  }

  if (imported.some((location) => location.isHome)) {
    state.locations = state.locations.map((location) => ({ ...location, isHome: false }));
  }

  state.locations.push(...imported);
  if (!getHome() && state.locations.length) {
    state.locations[0].isHome = true;
  }
  state.routeOrder = buildOptimizedOrder();
  elements.bulkInput.value = "";
  elements.bulkStatus.textContent = `Imported ${imported.length} address${imported.length === 1 ? "" : "es"}`;
  render();
}

function parseBulkAddresses(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^label\s*[,|]/i.test(line))
    .map(parseBulkLine)
    .filter(Boolean);
}

function parseBulkLine(line, index) {
  const homePrefix = /^home\s*:\s*/i;
  const isHomeLine = homePrefix.test(line);
  const normalizedLine = line.replace(homePrefix, "").trim();
  const delimiter = line.includes("|") ? "|" : ",";
  const parts = normalizedLine.split(delimiter).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;

  const maybeLat = Number(parts.at(-2));
  const maybeLng = Number(parts.at(-1));
  const hasLatLng = Number.isFinite(maybeLat) && Number.isFinite(maybeLng);
  const dataParts = hasLatLng ? parts.slice(0, -2) : parts;
  const lat = hasLatLng ? clamp(maybeLat, -90, 90) : null;
  const lng = hasLatLng ? clamp(maybeLng, -180, 180) : null;

  const homeFlagIndex = dataParts.findIndex((part) => /^home$/i.test(part));
  const isHome = isHomeLine || homeFlagIndex >= 0;
  const cleaned = dataParts.filter((_, partIndex) => partIndex !== homeFlagIndex);

  if (delimiter === "|" && cleaned.length >= 4) {
    return {
      label: cleaned[0] || `Stop ${index + 1}`,
      address: cleaned[1],
      city: cleaned[2],
      state: cleaned[3].toUpperCase(),
      lat,
      lng,
      isHome,
    };
  }

  if (delimiter === "|" && cleaned.length >= 2) {
    return {
      label: cleaned[0] || `Stop ${index + 1}`,
      address: cleaned.slice(1).join(", "),
      city: "",
      state: "",
      lat,
      lng,
      isHome,
    };
  }

  if (cleaned.length >= 3) {
    return {
      label: deriveLabel(cleaned.join(", "), index),
      address: cleaned[0],
      city: cleaned[1],
      state: cleaned[2].toUpperCase(),
      lat,
      lng,
      isHome,
    };
  }

  return {
    label: deriveLabel(cleaned[0], index),
    address: cleaned[0],
    city: "",
    state: "",
    lat,
    lng,
    isHome,
  };
}

async function geocodeMissingLocations() {
  if (!state.mapboxToken) {
    elements.bulkStatus.textContent = "Save a Mapbox token before geocoding";
    return;
  }

  const missing = state.locations.filter((location) => !hasCoordinates(location));
  if (!missing.length) {
    elements.bulkStatus.textContent = "No missing coordinates";
    return;
  }

  elements.bulkStatus.textContent = `Geocoding ${missing.length} location${missing.length === 1 ? "" : "s"}...`;
  let updated = 0;
  for (const location of missing) {
    const result = await geocodeLocation(location);
    if (result) {
      applyGeocodeResult(location, result);
      updated += 1;
    }
  }
  elements.adminStatus.textContent = `Geocoded ${updated} of ${missing.length}`;
  render();
}

async function geocodeLocation(location) {
  const query = encodeURIComponent(fullAddress(location));
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?limit=1&access_token=${encodeURIComponent(
    state.mapboxToken,
  )}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const feature = data.features?.[0];
    const center = feature?.center;
    if (!Array.isArray(center)) return null;
    return {
      lng: center[0],
      lat: center[1],
      address: feature.place_name || "",
      city: getContextValue(feature, "place"),
      state: getContextValue(feature, "region", true),
    };
  } catch {
    return null;
  }
}

function useBulkSample() {
  elements.bulkInput.value = [
    "Home: 100 S High Street, Columbus, OH",
    "1205 N High Street, Columbus, OH",
    "588 S 3rd Street, Columbus, OH",
    "2454 E Main Street, Bexley, OH",
  ].join("\n");
  elements.bulkStatus.textContent = "Sample rows added";
}

function applyGeocodeResult(location, geocoded) {
  location.lat = geocoded.lat;
  location.lng = geocoded.lng;
  if (!location.city && geocoded.city) location.city = geocoded.city;
  if (!location.state && geocoded.state) location.state = geocoded.state;
}

function getContextValue(feature, type, useShortCode = false) {
  const context = feature.context || [];
  const match = context.find((item) => item.id && item.id.startsWith(`${type}.`));
  if (!match) return "";
  if (useShortCode && match.short_code) {
    return match.short_code.split("-").pop().toUpperCase();
  }
  return match.text || "";
}

function deriveLabel(address, index) {
  const firstPart = String(address || "").split(",")[0].trim();
  return firstPart || `Stop ${index + 1}`;
}

function hasCoordinates(location) {
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return !(lat === 0 && lng === 0);
}

function formatCoordinates(location) {
  if (!hasCoordinates(location)) return "Coordinates missing";
  return `${Number(location.lat).toFixed(6)}, ${Number(location.lng).toFixed(6)}`;
}

function optionalCoordinate(value, min, max) {
  if (String(value).trim() === "") return null;
  return clamp(Number(value), min, max);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return null;
  return Math.min(Math.max(value, min), max);
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `location-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toggleSidebar() {
  const collapsed = !elements.sidebar.classList.contains("collapsed");
  elements.sidebar.classList.toggle("collapsed", collapsed);
  elements.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  elements.sidebarToggle.textContent = collapsed ? "Open Menu" : "Collapse Menu";
}

function startAddressResize(event) {
  if (window.matchMedia("(max-width: 980px)").matches) return;
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = elements.form.getBoundingClientRect().width;
  elements.addressLayout.classList.add("resizing");

  function handleMove(moveEvent) {
    const layoutWidth = elements.addressLayout.getBoundingClientRect().width;
    const nextWidth = Math.min(Math.max(startWidth + moveEvent.clientX - startX, 280), layoutWidth - 430);
    elements.addressLayout.style.setProperty("--address-form-width", `${nextWidth}px`);
  }

  function handleUp() {
    elements.addressLayout.classList.remove("resizing");
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
  }

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
}

function adjustAddressResizeWithKeyboard(event) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  if (window.matchMedia("(max-width: 980px)").matches) return;
  event.preventDefault();
  const currentWidth = elements.form.getBoundingClientRect().width;
  const delta = event.key === "ArrowLeft" ? -24 : 24;
  const layoutWidth = elements.addressLayout.getBoundingClientRect().width;
  const nextWidth = Math.min(Math.max(currentWidth + delta, 280), layoutWidth - 430);
  elements.addressLayout.style.setProperty("--address-form-width", `${nextWidth}px`);
}

elements.navTabs.forEach((tab) => {
  tab.addEventListener("click", () => setScreen(tab.dataset.screen));
});

elements.sidebarToggle.addEventListener("click", toggleSidebar);
elements.addressLayoutResizer.addEventListener("pointerdown", startAddressResize);
elements.addressLayoutResizer.addEventListener("keydown", adjustAddressResizeWithKeyboard);
elements.form.addEventListener("submit", handleSubmit);
elements.cancelEdit.addEventListener("click", resetForm);
elements.addAddress.addEventListener("click", () => {
  resetForm();
  elements.label.focus();
});
elements.addressSearch.addEventListener("input", renderAddresses);
elements.addressList.addEventListener("click", handleAddressAction);
elements.routeList.addEventListener("click", handleRouteAction);
elements.routeList.addEventListener("change", handleRouteAction);
elements.startTime.addEventListener("change", updateStartTime);
elements.saveToken.addEventListener("click", saveMapboxToken);
elements.bulkImport.addEventListener("click", handleBulkImport);
elements.bulkSample.addEventListener("click", useBulkSample);
elements.optimize.addEventListener("click", () => {
  state.routeOrder = buildOptimizedOrder();
  render();
});
elements.reverse.addEventListener("click", () => {
  state.routeOrder = buildReversedIncludedOrder();
  render();
});

async function initializeApp() {
  resetForm();
  await loadSiteConfig();
  render();
}

initializeApp();
