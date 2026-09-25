/**
 * 專案設定：只要改這個檔案就好。
 *
 * GOOGLE_MAPS_API_KEY：到 Google Cloud Console 建立的 API 金鑰。
 *   需要在同一個專案中啟用：
 *     - Maps JavaScript API（顯示地圖，四個功能都需要）
 *     - Geocoding API     （功能 2：座標 → 地址）
 *     - Routes API        （功能 4：路線規劃）
 *
 * MAP_ID：Advanced Marker（新版標記）必須搭配 Map ID 才能使用。
 *   'DEMO_MAP_ID' 是 Google 提供的開發測試用 ID，正式上線請到
 *   Cloud Console → Google Maps Platform → Map Management 建立自己的 Map ID。
 */
window.APP_CONFIG = {
  GOOGLE_MAPS_API_KEY: 'AIzaSyCKDhljpEdEt5JH3pyMQxti4glY3iRpgow',
  MAP_ID: 'DEMO_MAP_ID',
};
