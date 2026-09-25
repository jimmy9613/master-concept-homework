/**
 * 共用小工具：產生「假資料」座標用。
 */

/**
 * 可重現的亂數產生器（mulberry32 演算法）。
 * 和 Math.random() 不同，同一個 seed 每次都會產生相同的數列，
 * 所以每次重新整理頁面，熱點與標記的位置都一樣，方便觀察與除錯。
 */
function createRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // 0 ~ 1
  };

  // Box–Muller 轉換：把兩個 0~1 的均勻亂數轉成常態分佈亂數（平均 0、標準差 1）
  // 常態分佈的特性是「越靠近中心越密集」，很適合模擬人潮聚集的熱點。
  const gaussian = () => {
    let u = 0;
    while (u === 0) u = next(); // 避免 log(0)
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  return { next, gaussian };
}

/**
 * 以某個中心點為圓心，隨機灑出 count 個座標點。
 * spread 是標準差（單位：經緯度），0.01 度大約 1 公里。
 */
function scatterPoints(random, { lat, lng, count, spread }) {
  return Array.from({ length: count }, () => ({
    lat: lat + random.gaussian() * spread,
    lng: lng + random.gaussian() * spread,
  }));
}
