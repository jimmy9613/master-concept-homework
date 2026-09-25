/**
 * 功能 4：出行路線規劃
 *
 * 原理：
 *   1. 使用者輸入「出發地」「目的地」兩段文字，並選擇出行方式（走路 / 開車 / 大眾運輸）。
 *   2. 呼叫 Route.computeRoutes()，把這些條件送到 Google 的 Routes API。
 *      伺服器會先把地址文字轉成座標（地理編碼），再用路網資料算出最佳路線。
 *   3. 回傳的 Route 物件包含：
 *        path            路線上一連串的經緯度點（用來畫線）
 *        legs            每一段的起點 / 終點 / 步驟（用來放起訖點標記、大眾運輸分段上色）
 *        distanceMeters  總距離（公尺）
 *        durationMillis  總時間（毫秒）
 *   4. 把 path 畫成折線、在起訖點放標記、把距離與時間顯示在面板上，
 *      最後用 fitBounds 讓地圖自動縮放到剛好容納整條路線。
 *
 *   （舊版的 DirectionsService / DirectionsRenderer 已被 Google 列為 Legacy，這裡使用新版 Routes 函式庫。）
 */

async function init() {
  const [{ Map }, { AdvancedMarkerElement, PinElement }, { Route }, { LatLngBounds }] = await Promise.all([
    google.maps.importLibrary('maps'),
    google.maps.importLibrary('marker'),
    google.maps.importLibrary('routes'),
    google.maps.importLibrary('core'),
  ]);

  const map = new Map(document.getElementById('map'), {
    center: { lat: 25.04, lng: 121.54 },
    zoom: 13,
    mapId: APP_CONFIG.MAP_ID,
  });

  const form = document.getElementById('route-form');
  const originInput = document.getElementById('origin');
  const destinationInput = document.getElementById('destination');
  const submitButton = document.getElementById('submit');
  const status = document.getElementById('status');
  const result = document.getElementById('result');

  let drawnOnMap = []; // 目前畫在地圖上的折線與標記，下次規劃前要先清掉
  let latestRequestId = 0;

  form.addEventListener('submit', (event) => {
    event.preventDefault(); // 阻止表單送出導致頁面重新整理
    planRoute();
  });

  // 切換出行方式時，自動重新規劃
  form.querySelectorAll('input[name="mode"]').forEach((radio) => radio.addEventListener('change', planRoute));

  document.getElementById('swap').addEventListener('click', () => {
    [originInput.value, destinationInput.value] = [destinationInput.value, originInput.value];
    planRoute();
  });

  async function planRoute() {
    const origin = originInput.value.trim();
    const destination = destinationInput.value.trim();
    const travelMode = form.querySelector('input[name="mode"]:checked').value;
    if (!origin || !destination) return;

    const requestId = ++latestRequestId;
    clearRoute();
    setStatus('規劃中…');
    submitButton.disabled = true;

    try {
      // 步驟 2：向 Routes API 請求路線
      const { routes } = await Route.computeRoutes({
        origin, // 可以是地址文字、{lat, lng}、或 Place 物件
        destination,
        travelMode, // 'WALKING' | 'DRIVING' | 'TRANSIT'
        language: 'zh-TW',
        region: 'tw',
        // fields：只要求需要的欄位。Routes API 依欄位計費，而且沒列出的欄位不會回傳
        fields: ['path', 'legs', 'distanceMeters', 'durationMillis'],
      });

      if (requestId !== latestRequestId) return; // 期間使用者又發出新的請求，丟棄舊結果

      if (!routes?.length) {
        setStatus('找不到路線，請換個地址或出行方式試試看（例如跨海或該區域沒有大眾運輸）。', true);
        return;
      }

      drawRoute(routes[0], origin, destination);
      setStatus(null);
    } catch (err) {
      if (requestId !== latestRequestId) return;
      console.error(err);
      setStatus(`路線規劃失敗：${err.message}（請確認地址正確，且已在 Cloud Console 啟用 Routes API）`, true);
    } finally {
      if (requestId === latestRequestId) submitButton.disabled = false;
    }
  }

  /** 步驟 4：把路線畫到地圖上，並顯示時長和距離 */
  function drawRoute(route, originText, destinationText) {
    // (a) 路徑折線：createPolylines 會依出行方式自動上色（大眾運輸會分段顯示走路 / 搭車）
    const polylines = route.createPolylines();
    polylines.forEach((polyline) => polyline.setMap(map));

    // (b) 起訖點標記：起點取第一段 leg 的 startLocation，終點取最後一段 leg 的 endLocation
    const legs = route.legs ?? [];
    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];
    const startMarker = new AdvancedMarkerElement({
      map,
      position: firstLeg?.startLocation ?? route.path[0],
      title: `出發：${originText}`,
      content: new PinElement({ glyphText: '起', glyphColor: '#fff', background: '#188038', borderColor: '#0d652d' }),
    });
    const endMarker = new AdvancedMarkerElement({
      map,
      position: lastLeg?.endLocation ?? route.path[route.path.length - 1],
      title: `目的：${destinationText}`,
      content: new PinElement({ glyphText: '迄', glyphColor: '#fff', background: '#d93025', borderColor: '#a50e0e' }),
    });

    drawnOnMap = [...polylines, startMarker, endMarker];

    // (c) 讓地圖縮放到剛好看得到整條路線
    const bounds = new LatLngBounds();
    route.path.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 60); // 60px 留白

    // (d) 顯示時長與距離（某些情況 route 沒有 durationMillis，就把各段 leg 加總）
    const durationMillis =
      route.durationMillis ??
      legs.reduce((sum, leg) => sum + (leg.durationMillis ?? leg.staticDurationMillis ?? 0), 0);
    document.getElementById('duration').textContent = formatDuration(durationMillis);
    document.getElementById('distance').textContent = `（${formatDistance(route.distanceMeters)}）`;
    document.getElementById('endpoints').textContent = `${originText} → ${destinationText}`;
    renderTransitSteps(legs);
    result.hidden = false;
  }

  /**
   * (e) 大眾運輸：顯示要搭什麼、在哪上下車
   *   每一段 leg 由許多 step 組成；step.travelMode 是 'WALKING' 或 'TRANSIT'，
   *   搭乘的 step 會有 transitDetails（路線、上下車站、站數、時間）。
   *   連續的步行 step（例如「從 Z4 入口進站」「往東」「左轉」）合併成一段「步行 N 分鐘」。
   */
  function renderTransitSteps(legs) {
    const container = document.getElementById('transit-steps');
    const steps = legs.flatMap((leg) => leg.steps ?? []);
    container.hidden = !steps.some((s) => s.transitDetails);
    if (container.hidden) return container.replaceChildren(); // 走路、開車沒有搭乘資訊

    const segments = [];
    for (const step of steps) {
      const last = segments[segments.length - 1];
      if (step.transitDetails) {
        segments.push({ transit: step.transitDetails, millis: step.staticDurationMillis ?? 0 });
      } else if (last && !last.transit) {
        last.meters += step.distanceMeters;
      } else {
        segments.push({ meters: step.distanceMeters });
      }
    }

    container.replaceChildren(
      el('div', 'transit-title', '搭乘方式'),
      ...segments.map((seg) => (seg.transit ? transitSegment(seg) : walkSegment(seg)))
    );
  }

  function walkSegment({ meters }) {
    // 只顯示距離：Google 回傳的站內步行時間有時不合理（例如 220 公尺標示 1 秒），避免顯示奇怪的數字
    return el('div', 'seg walk', `🚶 步行 ${formatDistance(meters)}`);
  }

  function transitSegment({ transit, millis }) {
    const line = transit.transitLine;
    const vehicle = line?.vehicle;
    const seg = el('div', 'seg ride');

    // 第一行：交通工具圖示 + 路線名稱（用路線代表色）+ 開往哪裡
    const head = el('div', 'ride-head');
    const icon = vehicle?.localIconURL ?? vehicle?.iconURL; // localIconURL 是在地版圖示（例如台北捷運標誌）
    if (icon) {
      const img = el('img', 'ride-icon');
      img.src = String(icon);
      img.alt = vehicle.name ?? '';
      head.append(img);
    }
    // 公車：大家認的是路線號碼（shortName，例如「紅30」），name 是「故宮博物院-捷運劍潭站」這種全名；
    // 捷運、火車：name 是中文線名（例如「淡水信義線」），shortName 反而是英文
    const isBus = /BUS/.test(vehicle?.vehicleType ?? '');
    const lineLabel = (isBus ? line?.shortName : line?.name) ?? line?.name ?? line?.shortName ?? '大眾運輸';
    const badge = el('span', 'line-badge', lineLabel);
    badge.style.background = line?.color ?? '#5f6368';
    badge.style.color = line?.textColor ?? '#fff';
    const meta = [vehicle?.name, isBus && line?.name !== lineLabel && line?.name, transit.headsign && `開往 ${transit.headsign}`];
    head.append(badge, el('span', 'ride-meta', meta.filter(Boolean).join(' · ')));

    // 上車 → 下車
    seg.append(
      head,
      stopRow(transit.departureTime, transit.departureStop?.name, '上車'),
      el('div', 'ride-count', `搭 ${transit.stopCount} 站 · ${formatDuration(millis)}`),
      stopRow(transit.arrivalTime, transit.arrivalStop?.name, '下車')
    );
    return seg;
  }

  function stopRow(time, stopName, action) {
    const row = el('div', 'stop-row');
    row.append(el('span', 'stop-time', time ? formatClock(time) : ''), el('span', 'stop-name', `${stopName ?? '（未知站名）'} ${action}`));
    return row;
  }

  function clearRoute() {
    drawnOnMap.forEach((item) => {
      if (item instanceof AdvancedMarkerElement) item.map = null; // 標記：把 map 設成 null 即移除
      else item.setMap(null); // 折線：setMap(null) 即移除
    });
    drawnOnMap = [];
    result.hidden = true;
  }

  function setStatus(message, isError = false) {
    status.hidden = !message;
    status.textContent = message ?? '';
    status.classList.toggle('error', isError);
  }

  planRoute(); // 頁面開啟時先用預設地址規劃一次
}

/** 毫秒 → 「1 小時 5 分鐘」 */
function formatDuration(millis) {
  const totalMinutes = Math.max(1, Math.round(millis / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} 分鐘`;
  return minutes === 0 ? `${hours} 小時` : `${hours} 小時 ${minutes} 分鐘`;
}

/** Date → 台灣時間「16:39」 */
function formatClock(date) {
  return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
}

/** 建立 DOM 元素並用 textContent 放入文字（避免 XSS） */
function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 公尺 → 「850 公尺」或「4.5 公里」 */
function formatDistance(meters = 0) {
  return meters < 1000 ? `${meters} 公尺` : `${(meters / 1000).toFixed(1)} 公里`;
}

init().catch((err) => {
  console.error(err);
  showError(`地圖載入失敗：${err.message}`);
});
