/**
 * 功能 1：在地圖上繪製熱力圖
 *
 * 原理：
 *   熱力圖 = 把每個資料點當成一個「會向外擴散的光暈」，
 *   光暈互相重疊的地方數值會累加，最後依數值高低對應到顏色（綠 → 黃 → 紅）。
 *   這個計算由 deck.gl 的 HeatmapLayer 在 GPU（WebGL）上完成，
 *   再透過 GoogleMapsOverlay 疊加到 Google 地圖上，並跟著地圖一起平移、縮放。
 */

// 熱點設定：中心座標、要產生幾個點、分散程度（標準差，單位是經緯度）
const HOTSPOTS = [
  { name: '台北車站', lat: 25.0478, lng: 121.5170, count: 300, spread: 0.005 },
  { name: '西門町', lat: 25.0421, lng: 121.5075, count: 220, spread: 0.003 },
  { name: '信義區（台北 101）', lat: 25.0339, lng: 121.5645, count: 350, spread: 0.006 },
  { name: '東區（忠孝復興）', lat: 25.0416, lng: 121.5437, count: 250, spread: 0.004 },
  { name: '士林夜市', lat: 25.0880, lng: 121.5241, count: 200, spread: 0.004 },
  { name: '公館', lat: 25.0147, lng: 121.5340, count: 150, spread: 0.004 },
];

// 綠 → 黃 → 紅，仿照 Google 原本熱力圖的配色（deck.gl 用 [R, G, B] 表示顏色）
const COLOR_RANGE = [
  [0, 255, 0],
  [128, 255, 0],
  [255, 255, 0],
  [255, 170, 0],
  [255, 85, 0],
  [255, 0, 0],
];

async function init() {
  const { Map } = await google.maps.importLibrary('maps');

  const map = new Map(document.getElementById('map'), {
    center: { lat: 25.05, lng: 121.54 },
    zoom: 13,
  });

  // 1. 準備資料：每個點包含位置與權重（weight 越大，對熱度貢獻越多）
  const random = createRandom(2024);
  const points = HOTSPOTS.flatMap((spot) =>
    scatterPoints(random, spot).map(({ lat, lng }) => ({
      position: [lng, lat], // 注意：deck.gl 的座標順序是 [經度, 緯度]，和 Google 的 {lat, lng} 相反！
      weight: 1 + Math.floor(random.next() * 3), // 1 ~ 3
    }))
  );

  // 2. 建立 Overlay，並掛到地圖上
  const overlay = new deck.GoogleMapsOverlay({ layers: [] });
  overlay.setMap(map);

  // 3. 讀取面板上的參數，產生 HeatmapLayer
  const toggle = document.getElementById('toggle');
  const radius = document.getElementById('radius');
  const intensity = document.getElementById('intensity');

  function render() {
    document.getElementById('radius-value').textContent = radius.value;
    document.getElementById('intensity-value').textContent = Number(intensity.value).toFixed(1);

    // deck.gl 的設計是「圖層不可變」：參數改變時就建立一個新的 Layer 物件並交給 overlay，
    // 只要 id 相同，deck.gl 會自動比對差異、只更新有變的部分，不會整個重建。
    const heatmapLayer = new deck.HeatmapLayer({
      id: 'heatmap',
      data: points,
      getPosition: (d) => d.position,
      getWeight: (d) => d.weight,
      radiusPixels: Number(radius.value), // 每個點光暈的半徑（螢幕像素）
      intensity: Number(intensity.value), // 整體熱度倍率，越大越容易變紅
      threshold: 0.05, // 熱度低於最大值 5% 的區域淡出為透明
      colorRange: COLOR_RANGE,
      visible: toggle.checked,
    });

    overlay.setProps({ layers: [heatmapLayer] });
  }

  [toggle, radius, intensity].forEach((input) => input.addEventListener('input', render));
  render();
}

init().catch((err) => {
  console.error(err);
  showError(`地圖載入失敗：${err.message}`);
});
