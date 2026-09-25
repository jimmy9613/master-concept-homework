/**
 * Google Maps JavaScript API 載入器
 *
 * 使用 Google 官方的「Dynamic Library Import」寫法：
 *   這段程式執行後只會先在全域建立 google.maps.importLibrary() 這個函式，
 *   並不會馬上下載地圖程式；等到第一次呼叫 importLibrary('maps') 時，
 *   才真正插入 <script> 去下載 Maps API，並且只載入需要的函式庫
 *   （maps、marker、geocoding、routes...），減少不必要的下載量。
 */
(function () {
  const { GOOGLE_MAPS_API_KEY: key } = window.APP_CONFIG || {};

  if (!key || key === 'YOUR_API_KEY') {
    showError('尚未設定 API 金鑰：請打開 config.js，把 YOUR_API_KEY 換成你自己的 Google Maps API Key。');
  }

  // 金鑰錯誤、未啟用 Maps JavaScript API、或網站限制不符時，Google 會呼叫這個全域函式
  window.gm_authFailure = function () {
    showError('Google Maps 驗證失敗：請確認 API 金鑰正確、已啟用 Maps JavaScript API，且金鑰的「網站限制」允許目前的網址。');
  };

  // ↓ Google 官方提供的 bootstrap loader（原樣使用，只有最後的參數是我們自己的設定）
  // https://developers.google.com/maps/documentation/javascript/load-maps-js-api
  (g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
    key,
    v: 'weekly',       // 使用每週更新的穩定版
    language: 'zh-TW', // 地圖文字、地址、路線說明都用繁體中文
    region: 'TW',      // 地址解析與路線結果以台灣為優先
  });

  /** 在頁面頂端顯示錯誤訊息（其他頁面的程式也會共用） */
  function showError(message) {
    let banner = document.getElementById('error-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'error-banner';
      banner.className = 'error-banner';
      document.body.prepend(banner);
    }
    banner.textContent = message;
  }
  window.showError = showError;
})();
