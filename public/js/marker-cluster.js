/**
 * 功能 3：繪製 100 個標記點，縮小地圖時呈現點聚合（Marker Clustering）效果
 *
 * 原理：
 *   地圖每次縮放 / 平移結束後，MarkerClusterer 會重新計算：
 *     1. 把每個標記的經緯度換算成「目前縮放層級下的螢幕像素位置」。
 *     2. 在像素空間中，把彼此距離小於某個半徑（預設 60px）的標記分成同一群。
 *     3. 一群只有 1 個標記 → 直接顯示該標記；
 *        一群有多個標記 → 把群內標記都隱藏，改在群的中心畫一個顯示數量的聚合點。
 *   因為分群是用「螢幕距離」而不是「實際距離」，所以地圖越縮小，標記在螢幕上越擠，
 *   就越容易被合併；放大後螢幕距離變大，聚合點就會拆開。
 *   （預設演算法 SuperCluster 會先建好空間索引，所以即使上萬個點也能很快算完。）
 */

// 8 個城市，每個城市周圍分配若干標記，總共 100 個
const CITIES = [
  { name: '台北', lat: 25.0375, lng: 121.5637, count: 25, spread: 0.04 },
  { name: '新竹', lat: 24.8039, lng: 120.9647, count: 10, spread: 0.03 },
  { name: '台中', lat: 24.1477, lng: 120.6736, count: 15, spread: 0.04 },
  { name: '台南', lat: 22.9999, lng: 120.2270, count: 12, spread: 0.03 },
  { name: '高雄', lat: 22.6273, lng: 120.3014, count: 15, spread: 0.03 },
  { name: '宜蘭', lat: 24.7570, lng: 121.7533, count: 8, spread: 0.02 },
  { name: '花蓮', lat: 23.9871, lng: 121.6015, count: 8, spread: 0.02 },
  { name: '台東', lat: 22.7583, lng: 121.1444, count: 7, spread: 0.02 },
];

async function init() {
  const [{ Map, InfoWindow }, { AdvancedMarkerElement, PinElement }] = await Promise.all([
    google.maps.importLibrary('maps'),
    google.maps.importLibrary('marker'),
  ]);

  const map = new Map(document.getElementById('map'), {
    center: { lat: 23.7, lng: 120.95 }, // 台灣中心
    zoom: 7, // 縮小到看得到全台灣，一開始就會看到聚合效果
    mapId: APP_CONFIG.MAP_ID,
  });

  const infoWindow = new InfoWindow();

  // 1. 產生 100 個座標（固定 seed，每次重新整理位置都一樣）
  const random = createRandom(100);
  const locations = CITIES.flatMap((city) =>
    scatterPoints(random, city).map((position) => ({ ...position, city: city.name }))
  );

  // 2. 為每個座標建立一個標記
  //    注意：這裡「不」設定 marker.map，要顯示哪些標記交給 MarkerClusterer 決定
  const markers = locations.map((location, i) => {
    const pin = new PinElement({
      glyphText: String(i + 1), // 標記上顯示的編號
      glyphColor: '#fff',
      background: '#ea4335',
      borderColor: '#b31412',
    });

    const marker = new AdvancedMarkerElement({
      position: { lat: location.lat, lng: location.lng },
      content: pin,
      title: `標記 #${i + 1}（${location.city}）`,
      gmpClickable: true, // 設為 true 才會觸發 gmp-click 事件
    });

    marker.addEventListener('gmp-click', () => {
      infoWindow.setContent(marker.title);
      infoWindow.open({ map, anchor: marker });
    });

    return marker;
  });

  // 3. 把所有標記交給 MarkerClusterer，它會監聽地圖縮放並自動分群
  const clusterer = new markerClusterer.MarkerClusterer({
    map,
    markers,
    // 預設即為 SuperClusterAlgorithm，這裡寫出來方便調整參數：
    //   radius：分群半徑（像素），越大越容易被合併
    //   maxZoom：超過這個縮放層級就不再聚合，全部顯示個別標記
    algorithm: new markerClusterer.SuperClusterAlgorithm({ radius: 60, maxZoom: 15 }),
  });

  // 4. 每次分群完成後，更新左側面板的統計數字，方便觀察縮放與聚合的關係
  const status = document.getElementById('status');
  clusterer.addListener('clusteringend', () => {
    const groups = clusterer.clusters; // 本次分群結果
    const clusterCount = groups.filter((c) => c.count > 1).length;
    const singleCount = groups.filter((c) => c.count === 1).length;
    status.textContent =
      `縮放層級 ${map.getZoom()}：聚合點 ${clusterCount} 個、單獨標記 ${singleCount} 個（共 ${markers.length} 個標記）`;
  });
}

init().catch((err) => {
  console.error(err);
  showError(`地圖載入失敗：${err.message}`);
});
