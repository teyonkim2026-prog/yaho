const CONFIG = window.BEACH_CONFIG || {};
const API_BASE = "https://apis.data.go.kr/1360000/BeachInfoservice";

const state = {
  beaches: [],
  markers: new Map(),
  selected: null,
  forecastCache: new Map()
};

const $ = (id) => document.getElementById(id);

const map = L.map("map", { zoomControl: true }).setView([36.35, 127.75], 7);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function regionOf(name) {
  const groups = [
    ["인천", ["을왕리","왕산","하나개","실미","십리포","장경리","대부","영흥"]],
    ["강원", ["속초","대포","낙산","하조대","죽도","인구","경포","강문","안목","정동진","망상","추암","삼척","맹방","장호"]],
    ["경북", ["영일대","칠포","월포","구룡포","오류","나정","봉길","관성","진하","대진","고래불","후포","월송"]],
    ["부산", ["해운대","송정","광안리","다대포","일광","임랑","송도","태종대"]],
    ["경남", ["상주","송정","설리","두곡","월포","사촌","명사","학동","구조라","와현","농소","물안","덕포","흥남"]],
    ["전남", ["여수","만성리","웅천","모사금","방죽포","무슬목","율포","중리","상주","송호","명사십리","가계","대광","우전","짱뚱어"]],
    ["전북", ["선유도","동호","구시포","변산","격포","고사포","위도","춘장대"]],
    ["충남", ["대천","무창포","춘장대","꽃지","만리포","천리포","백리포","연포","몽산포","청포대","마검포","갈음이","파도리"]],
    ["제주", ["협재","금능","곽지","이호","삼양","함덕","김녕","월정리","평대","세화","표선","중문","색달","화순","사계","하모","신양","섭지코지"]],
    ["울산", ["진하","일산","주전","몽돌"]]
  ];
  for (const [region, words] of groups) if (words.some(w => name.includes(w))) return region;
  return "기타";
}

function getKST() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}
function pad(n){return String(n).padStart(2,"0")}
function ymd(d){return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`}
function hhmm(d){return `${pad(d.getHours())}${pad(d.getMinutes())}`}

function latestShortBase() {
  const now = getKST();
  let h = now.getHours();
  const candidates = [2,5,8,11,14,17,20,23];
  let best = candidates.filter(x => x <= h).pop();
  if (best == null) {
    now.setDate(now.getDate()-1);
    best = 23;
  }
  return {date: ymd(now), time: pad(best)+"00"};
}

function latestUltraBase() {
  const now = getKST();
  let h = now.getHours();
  const min = now.getMinutes();
  if (min < 45) h -= 1;
  if (h < 0) {
    now.setDate(now.getDate()-1); h=23;
  }
  return {date: ymd(now), time: pad(h)+"30"};
}

function apiUrl(path, params) {
  const key = CONFIG.serviceKey;
  if (!key) throw new Error("API 키가 config.js에 없습니다.");
  const u = new URL(API_BASE + path);
  u.searchParams.set("serviceKey", key);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, v));
  return u.toString();
}

async function api(path, params) {
  const res = await fetch(apiUrl(path, params));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.response?.header?.resultCode && data.response.header.resultCode !== "00") {
    throw new Error(data.response.header.resultMsg || "API 오류");
  }
  return data.response?.body?.items?.item || [];
}

function weatherIcon(sky, pty) {
  pty = Number(pty || 0);
  sky = Number(sky || 1);
  if (pty === 1 || pty === 4 || pty === 5) return "🌧️";
  if (pty === 2 || pty === 6) return "🌨️";
  if (pty === 3 || pty === 7) return "❄️";
  if (sky === 3) return "⛅";
  if (sky === 4) return "☁️";
  return "☀️";
}
function skyText(sky, pty) {
  pty = Number(pty || 0); sky = Number(sky || 1);
  if (pty === 1 || pty === 4 || pty === 5) return "비";
  if (pty === 2 || pty === 6) return "비/눈";
  if (pty === 3 || pty === 7) return "눈";
  if (sky === 3) return "구름많음";
  if (sky === 4) return "흐림";
  return "맑음";
}

function groupForecast(items) {
  const grouped = new Map();
  for (const x of items) {
    const t = x.fcstDate + x.fcstTime;
    if (!grouped.has(t)) grouped.set(t, {});
    grouped.get(t)[x.category] = x.fcstValue;
  }
  return [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}

function setText(id, value) { $(id).textContent = value; }

function showDetail(beach) {
  state.selected = beach;
  $("welcome").classList.add("hidden");
  $("detail").classList.remove("hidden");
  setText("beachName", beach.name);
  setText("coords", `${beach.lat.toFixed(5)}, ${beach.lon.toFixed(5)} · 격자 ${beach.nx}, ${beach.ny}`);
  setText("status", "날씨 정보를 불러오는 중...");
  $("forecastList").innerHTML = '<div class="empty">데이터를 불러오는 중입니다.</div>';
  map.flyTo([beach.lat, beach.lon], Math.max(map.getZoom(), 10), {duration: .7});
  loadBeachData(beach);
}

async function loadBeachData(beach) {
  const cacheKey = beach.id + "-" + ymd(getKST());
  if (state.forecastCache.has(cacheKey)) {
    renderAll(state.forecastCache.get(cacheKey));
    return;
  }
  try {
    const base = latestShortBase();
    const forecast = await api("/getVilageFcstBeach", {
      numOfRows: 1000, pageNo: 1, dataType: "JSON",
      base_date: base.date, base_time: base.time, beach_num: beach.id
    });

    const data = {forecast, wave:null, water:null, tide:null, sun:null};
    // Supplementary data is seasonal/observation based. Failure is intentionally non-fatal.
    const now = getKST();
    const searchTime = `${ymd(now)}${pad(now.getHours())}00`;
    try { data.wave = (await api("/getWhBuoyBeach",{numOfRows:10,pageNo:1,dataType:"JSON",beach_num:beach.id,searchTime}))[0] || null; } catch {}
    try { data.water = (await api("/getTwBuoyBeach",{numOfRows:10,pageNo:1,dataType:"JSON",beach_num:beach.id,searchTime}))[0] || null; } catch {}
    try { data.tide = await api("/getTideInfoBeach",{numOfRows:10,pageNo:1,dataType:"JSON",base_date:ymd(now),beach_num:beach.id}); } catch {}
    try { data.sun = (await api("/getSunInfoBeach",{numOfRows:10,pageNo:1,dataType:"JSON",Base_date:ymd(now),beach_num:beach.id}))[0] || null; } catch {}

    state.forecastCache.set(cacheKey, data);
    renderAll(data);
  } catch (e) {
    console.error(e);
    setText("status", `날씨 정보를 가져오지 못했습니다: ${e.message}`);
    $("forecastList").innerHTML = '<div class="empty">API 키, 요청 시각 또는 API 서버 상태를 확인해주세요.</div>';
  }
}

function renderAll(data) {
  const groups = groupForecast(data.forecast);
  const first = groups.find(g => g[0] >= ymd(getKST()) + pad(getKST().getHours()) + "00") || groups[0];
  const cur = first?.[1] || {};
  setText("currentTemp", cur.TMP != null ? `${Number(cur.TMP).toFixed(1)}°` : "--°");
  setText("currentSky", skyText(cur.SKY, cur.PTY));
  $("weatherIcon").textContent = weatherIcon(cur.SKY, cur.PTY);
  setText("currentPop", cur.POP != null ? `${cur.POP}%` : "-");
  setText("currentReh", cur.REH != null ? `${cur.REH}%` : "-");
  setText("currentWind", cur.WSD != null ? `${cur.WSD} m/s` : "-");
  setText("currentWave", cur.WAV != null ? `${cur.WAV} m` : data.wave?.wh != null ? `${data.wave.wh} m` : "-");
  setText("status", `기상청 단기예보 · ${new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})} 조회`);

  $("forecastList").innerHTML = groups.slice(0, 18).map(([key,v]) => {
    const time = key.slice(8,10)+":"+key.slice(10,12);
    const date = key.slice(0,4)+"."+key.slice(4,6)+"."+key.slice(6,8);
    return `<div class="forecast-card">
      <div class="time">${date}<br>${time}</div>
      <div class="ico">${weatherIcon(v.SKY,v.PTY)}</div>
      <div class="temp">${v.TMP ?? "-"}°C</div>
      <div class="rain">비 ${v.POP ?? "-"}%</div>
    </div>`;
  }).join("");

  setText("waterTemp", data.water?.tw != null ? `${data.water.tw}°C` : "자료 없음");
  setText("wave", data.wave?.wh != null ? `${data.wave.wh} m` : "자료 없음");
  setText("sunrise", data.sun?.sunrise || "자료 없음");
  setText("sunset", data.sun?.sunset || "자료 없음");

  if (data.tide?.length) {
    $("tideList").innerHTML = data.tide.map(x => {
      const high = String(x.tiType || "").startsWith("FT");
      return `<div class="tide-row"><span class="tide-type">${high ? "만조" : "간조"}</span><span>${x.tiTime || "-"} · 수위 ${x.tilevel ?? "-"} cm</span></div>`;
    }).join("");
  } else {
    $("tideList").innerHTML = '<div class="empty">조석 자료가 없거나 현재 제공 기간이 아닙니다.</div>';
  }
}

function initRegions() {
  const regions = [...new Set(state.beaches.map(b=>regionOf(b.name)))].sort();
  $("regionSelect").innerHTML += regions.map(r=>`<option value="${r}">${r}</option>`).join("");
}

function renderMarkers(filter="") {
  for (const [id, marker] of state.markers) {
    const b = state.beaches.find(x=>x.id===id);
    const ok = !filter || b.name.includes(filter) || regionOf(b.name) === filter;
    if (ok) marker.addTo(map); else map.removeLayer(marker);
  }
}

function initMarkers() {
  state.beaches.forEach(b => {
    const marker = L.circleMarker([b.lat,b.lon], {
      radius: 5, color:"#fff", weight:1.5, fillColor:"#0d7ff2", fillOpacity:.85
    });
    marker.bindPopup(`<div class="popup-title">${escapeHtml(b.name)}</div><div>${regionOf(b.name)}</div><div class="popup-link">클릭해서 상세 날씨 보기</div>`);
    marker.on("click", () => showDetail(b));
    state.markers.set(b.id, marker);
    marker.addTo(map);
  });
}

$("searchInput").addEventListener("input", e => {
  const q = e.target.value.trim();
  const region = $("regionSelect").value;
  renderMarkers(q || region);
});
$("regionSelect").addEventListener("change", e => {
  const q = $("searchInput").value.trim();
  renderMarkers(q || e.target.value);
});
$("closeDetail").addEventListener("click", () => {
  $("detail").classList.add("hidden");
  $("welcome").classList.remove("hidden");
});
$("refreshBtn").addEventListener("click", () => {
  if (state.selected) {
    const keyPrefix = state.selected.id + "-";
    [...state.forecastCache.keys()].filter(k=>k.startsWith(keyPrefix)).forEach(k=>state.forecastCache.delete(k));
    showDetail(state.selected);
  } else {
    location.reload();
  }
});

fetch("beaches.json")
  .then(r => r.json())
  .then(beaches => {
    state.beaches = beaches;
    setText("beachCount", beaches.length);
    initRegions();
    initMarkers();
  })
  .catch(err => {
    console.error(err);
    setText("beachCount","0");
  });
