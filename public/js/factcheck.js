/**
 * 功能 5：網路訊息真偽判斷（前端）
 *
 * 前端只負責：收集輸入 → 呼叫我們自己的後端 /api/fact-check → 把結果畫出來。
 * 真正呼叫 Gemini 的是後端（server/），API 金鑰也只存在後端。
 */

const VERDICTS = {
  true: { label: '正確', className: 'v-true' },
  partly_true: { label: '部分正確', className: 'v-partly' },
  false: { label: '錯誤', className: 'v-false' },
  unverifiable: { label: '無法證實', className: 'v-unknown' },
};
const CONFIDENCE = { high: '高', medium: '中', low: '低' };

const PRESETS = [
  {
    label: '竹子取水',
    text: '網路上流傳各種野外求生方法，當口渴難耐，身旁又無水時，據說只要找到竹林，砍下一節竹子，馬上就會流出水來！？',
  },
  {
    label: '基本工資（時事）',
    text: '聽說從 2026 年開始，台灣的基本工資已經調漲到每月 3 萬元以上了？',
  },
  {
    label: '微波爐致癌',
    text: '微波爐加熱過的食物會產生輻射、吃了會致癌，而且營養會被破壞殆盡，千萬不要再用了！',
  },
];

const card = document.getElementById('result');
const form = document.getElementById('check-form');
const messageInput = document.getElementById('message');
const submitButton = document.getElementById('submit');
let status = { model: 'Gemini', configured: false }; // 由 /api/status 取得

init();

async function init() {
  // 範例按鈕
  const presets = document.getElementById('presets');
  for (const preset of PRESETS) {
    const button = el('button', 'chip', preset.label);
    button.type = 'button';
    button.addEventListener('click', () => (messageInput.value = preset.text));
    presets.append(button);
  }
  messageInput.value = PRESETS[0].text;

  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error();
    status = await res.json();
  } catch {
    // 用 python -m http.server 開啟時沒有後端，/api/status 會失敗
    renderError('連不到後端伺服器。這個功能需要後端：請在專案資料夾執行 npm start，再開啟 http://localhost:8000/factcheck.html');
    submitButton.disabled = true;
    return;
  }
  renderIdle();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;

  submitButton.disabled = true;
  const stopTimer = renderLoading();
  try {
    const res = await fetch('/api/fact-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `伺服器錯誤（${res.status}）`);
    renderResult(data);
  } catch (err) {
    renderError(err.message);
  } finally {
    stopTimer();
    submitButton.disabled = false;
  }
});

/* ---------------- 畫面渲染 ----------------
 * 模型的輸出屬於「不可信任的內容」，一律用 textContent 放入畫面，不用 innerHTML，避免 XSS。
 */

function cardHeader(statusText) {
  const header = el('header', 'card-header');
  const name = el('div', 'card-title', '查證結果');
  name.append(el('span', 'card-model', status.model));
  header.append(name, el('span', 'card-status', statusText));
  return header;
}

function renderIdle() {
  card.className = 'result-card';
  card.replaceChildren(
    cardHeader(''),
    status.configured
      ? el('p', 'card-note', '輸入訊息後按「開始查證」。')
      : el('p', 'card-note warn', '⚠ 伺服器尚未設定 GEMINI_API_KEY：請在 .env 填入金鑰後重新執行 npm start。')
  );
}

function renderLoading() {
  const header = cardHeader('查證中… 0 秒');
  const statusText = header.querySelector('.card-status');
  card.className = 'result-card';
  card.replaceChildren(
    header,
    el('div', 'spinner'),
    el('p', 'card-note', '① Gemini 產生關鍵字 → ② 檢索 Google 新聞、Cofacts、維基百科 → ③ Gemini 根據資料判斷，通常需要 5～20 秒…')
  );

  const startedAt = Date.now();
  const timer = setInterval(() => {
    statusText.textContent = `查證中… ${Math.round((Date.now() - startedAt) / 1000)} 秒`;
  }, 1000);
  return () => clearInterval(timer);
}

function renderError(message) {
  card.className = 'result-card error';
  card.replaceChildren(cardHeader('失敗'), el('p', 'card-note warn', message));
}

function renderResult({ verdict: v, claim, queries, wikiTerms, documents, sources, elapsedMs }) {
  const verdict = VERDICTS[v.verdict] ?? VERDICTS.unverifiable;
  card.className = 'result-card';

  // 判定結果
  const verdictRow = el('div', 'verdict-row');
  verdictRow.append(
    el('span', `verdict-badge ${verdict.className}`, verdict.label),
    el('span', 'confidence', `信心度：${CONFIDENCE[v.confidence] ?? v.confidence}`)
  );

  const children = [cardHeader(`完成，${(elapsedMs / 1000).toFixed(1)} 秒`), verdictRow, el('p', 'summary', v.summary)];

  // 逐條主張
  if (v.claims?.length) {
    const list = el('ul', 'claims');
    for (const c of v.claims) {
      const item = el('li');
      item.append(el('b', '', c.claim), el('div', '', c.finding));
      list.append(item);
    }
    children.push(el('h3', '', '逐條查證'), list);
  }

  children.push(el('h3', '', '說明'), el('p', 'explanation', v.explanation));
  if (v.advice) children.push(el('p', 'advice', `💡 ${v.advice}`));

  // 參考來源：Gemini 判斷時實際引用的資料
  children.push(el('h3', '', `判斷依據的來源（${sources.length}）`));
  if (sources.length) {
    const list = el('ol', 'sources');
    sources.forEach((doc) => list.append(sourceItem(doc)));
    children.push(list);
  } else {
    children.push(el('p', 'card-note', '檢索到的資料都與這則訊息沒有直接關係，Gemini 改依一般知識判斷（說明中會註明）。'));
  }

  // 檢索過程：讓人看到系統「查了什麼、查到什麼」
  const process = el('details', 'process');
  const counts = countBy(documents, (d) => d.source.replace(/（.*$/, ''));
  process.append(
    el('summary', '', `檢索過程：共檢索到 ${documents.length} 筆資料（${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join('、') || '無'}）`)
  );
  const terms = el('div', 'queries');
  terms.append(el('span', 'chip static', `核心主張：${claim}`));
  queries.forEach((q) => terms.append(el('span', 'chip static', `🔍 ${q}`)));
  wikiTerms.forEach((t) => terms.append(el('span', 'chip static', `📖 ${t}`)));
  const cited = new Set(sources.map((s) => s.url));
  const all = el('ol', 'sources');
  documents.forEach((doc) => all.append(sourceItem(doc, cited.has(doc.url))));
  process.append(el('h3', '', '① Gemini 產生的檢索字詞'), terms, el('h3', '', '② 檢索到的資料（③ 標示 ✓ 的是 Gemini 引用的）'), all);
  children.push(process);

  card.replaceChildren(...children);
}

/** 一筆來源：標題連結 + 來源名稱 + 日期 */
function sourceItem(doc, isCited) {
  const item = el('li');
  // 只接受 http(s) 網址，避免 javascript: 之類的惡意連結
  if (/^https?:\/\//i.test(doc.url)) {
    const link = el('a', '', doc.title);
    link.href = doc.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    item.append(link);
  } else {
    item.append(el('span', '', doc.title));
  }
  item.append(el('span', 'tag', [doc.source, doc.date].filter(Boolean).join('｜')));
  if (isCited) item.append(el('span', 'tag ok', '✓ 引用'));
  return item;
}

function countBy(list, keyOf) {
  return list.reduce((acc, x) => ((acc[keyOf(x)] = (acc[keyOf(x)] ?? 0) + 1), acc), {});
}

/** 建立 DOM 元素的小工具 */
function el(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
