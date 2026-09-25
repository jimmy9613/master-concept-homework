/**
 * 功能 2：點擊地圖任意位置 → 繪製標記 → 顯示地址
 *
 * 原理（三個步驟）：
 *   1. 監聽地圖的 click 事件，事件物件 event.latLng 就是點擊處的經緯度。
 *   2. 把標記（AdvancedMarkerElement）移到該經緯度。
 *   3. 用 Geocoder 做「反向地理編碼」（Reverse Geocoding）：
 *      把經緯度送到 Google 的 Geocoding API，換回人看得懂的地址，再用 InfoWindow 顯示。
 */

async function init() {
  // 依需求分別載入：地圖、標記、地理編碼 三個函式庫
  const [{ Map, InfoWindow }, { AdvancedMarkerElement }, { Geocoder }] = await Promise.all([
    google.maps.importLibrary('maps'),
    google.maps.importLibrary('marker'),
    google.maps.importLibrary('geocoding'),
  ]);

  const map = new Map(document.getElementById('map'), {
    center: { lat: 25.0478, lng: 121.5170 }, // 台北車站
    zoom: 13,
    mapId: APP_CONFIG.MAP_ID, // AdvancedMarkerElement 必須搭配 mapId
  });

  const geocoder = new Geocoder();
  const infoWindow = new InfoWindow();
  const marker = new AdvancedMarkerElement({ title: '點擊位置' }); // 先不指定 map，所以還不會顯示
  const status = document.getElementById('status');

  // 用來處理「連點」：只顯示最後一次點擊的結果，避免慢回來的舊結果蓋掉新結果
  let latestRequestId = 0;

  map.addListener('click', async (event) => {
    // 點到地圖上的地標（POI）時，Google 會自動跳出它自己的資訊視窗，這裡把它擋掉，改用我們的
    if (event.placeId) event.stop();

    const latLng = event.latLng;
    const requestId = ++latestRequestId;

    // 步驟 2：移動標記並顯示
    marker.position = latLng;
    marker.map = map;
    showInfo(latLng, '查詢地址中…');

    // 步驟 3：反向地理編碼
    try {
      const { results } = await geocoder.geocode({ location: latLng });
      if (requestId !== latestRequestId) return; // 使用者已經點了別的地方
      showInfo(latLng, results[0]?.formatted_address ?? '查無地址');
    } catch (err) {
      if (requestId !== latestRequestId) return;
      // 例如點在海上會回傳 ZERO_RESULTS；未啟用 Geocoding API 會回傳 REQUEST_DENIED
      const message = err.code === 'ZERO_RESULTS' ? '這個位置查無地址（可能在海上或無人區）' : `查詢失敗：${err.message}`;
      showInfo(latLng, message);
    }
  });

  /** 同時更新 InfoWindow 與左側面板 */
  function showInfo(latLng, addressText) {
    const coords = `${latLng.lat().toFixed(6)}, ${latLng.lng().toFixed(6)}`;

    // 用 DOM 建立內容並以 textContent 填入，而非拼接 HTML 字串，可避免 XSS
    const content = document.createElement('div');
    content.className = 'info';
    const address = document.createElement('div');
    address.className = 'address';
    address.textContent = addressText;
    const coordsEl = document.createElement('div');
    coordsEl.className = 'coords';
    coordsEl.textContent = `經緯度：${coords}`;
    content.append(address, coordsEl);

    infoWindow.setContent(content);
    infoWindow.open({ map, anchor: marker }); // anchor 指定視窗要「掛」在哪個標記上方

    status.textContent = `${addressText}（${coords}）`;
  }
}

init().catch((err) => {
  console.error(err);
  showError(`地圖載入失敗：${err.message}`);
});
