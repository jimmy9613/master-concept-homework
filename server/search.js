/**
 * 步驟 2：從免費、不需金鑰的公開資料來源檢索資料
 *
 *   來源            提供什麼                          為什麼選它
 *   ─────────────────────────────────────────────────────────────────────
 *   Google 新聞 RSS  最新新聞標題、媒體、發布時間       即時性：今天的新聞今天就查得到
 *   Cofacts         台灣網友回報的可疑訊息 + 志工查核   專門針對台灣流傳的謠言
 *   維基百科         條目摘要                          背景知識（科學、常識類的主張）
 *
 * 每筆資料整理成相同格式：{ source, title, snippet, url, date }，再交給 Gemini 判斷。
 * 任何一個來源失敗都不影響其他來源（例如某個網站暫時連不上）。
 */

const TIMEOUT_MS = 8000;
const USER_AGENT = 'factcheck-homework/1.0 (student project)'; // 維基百科要求 API 使用者表明身分

export async function searchAll({ claim, queries, wikiTerms }) {
  const tasks = [
    ...queries.map((q) => searchGoogleNews(q)),
    searchCofacts(claim), // Cofacts 用「核心主張短句」找相似的謠言訊息
    ...wikiTerms.map((term) => searchWikipedia(term)),
  ];
  const results = await Promise.allSettled(tasks);

  const documents = [];
  const seen = new Set();
  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('[search]', r.reason?.message ?? r.reason);
      continue;
    }
    for (const doc of r.value) {
      if (seen.has(doc.url)) continue; // 不同關鍵字可能搜到同一篇
      seen.add(doc.url);
      documents.push(doc);
    }
  }
  return documents;
}

/* ---------- Google 新聞 RSS ---------- */

async function searchGoogleNews(query, limit = 5) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
  const xml = await fetchText(url);

  // RSS 是 XML：每則新聞是一個 <item>，這裡用正規表示式取出需要的欄位
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit).map(([, item]) => {
    const source = decodeXml(tag(item, 'source'));
    const title = decodeXml(tag(item, 'title')).replace(new RegExp(`\\s+-\\s+${escapeRegExp(source)}$`), ''); // 去掉標題尾端的「 - 媒體名」
    return {
      source: `Google 新聞（${source || '未知媒體'}）`,
      title,
      snippet: '',
      url: decodeXml(tag(item, 'link')),
      date: formatDate(tag(item, 'pubDate')),
    };
  });
}

/* ---------- Cofacts 真的假的 ---------- */

const COFACTS_REPLY_TYPES = {
  RUMOR: '含有不實訊息',
  NOT_RUMOR: '含有正確訊息',
  OPINIONATED: '含有個人意見',
  NOT_ARTICLE: '不在查證範圍',
};

async function searchCofacts(claim, limit = 3) {
  // moreLikeThis：找「內容相似」的訊息；minimumShouldMatch 30% = 至少三成的詞要相符（預設太嚴格，常常找不到）
  const query = `query ($text: String) {
    ListArticles(filter: { moreLikeThis: { like: $text, minimumShouldMatch: "30%" } }, orderBy: [{ _score: DESC }], first: ${limit}) {
      edges { node { id text createdAt articleReplies(status: NORMAL) { reply { type text } } } }
    }
  }`;
  const res = await fetch('https://api.cofacts.tw/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { text: claim } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Cofacts HTTP ${res.status}`);
  const { data, errors } = await res.json();
  if (errors) throw new Error(`Cofacts: ${errors[0]?.message}`);

  return data.ListArticles.edges.map(({ node }) => {
    const replies = node.articleReplies
      .slice(0, 2)
      .map(({ reply }) => `【查核回應：${COFACTS_REPLY_TYPES[reply.type] ?? reply.type}】${truncate(reply.text, 300)}`);
    return {
      source: 'Cofacts 真的假的',
      title: `網友回報的訊息：${truncate(node.text, 60)}`,
      snippet: replies.length ? replies.join('\n') : '（這則訊息尚無查核回應）',
      url: `https://cofacts.tw/article/${node.id}`,
      date: formatDate(node.createdAt),
    };
  });
}

/* ---------- 維基百科 ---------- */

async function searchWikipedia(query, limit = 2) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: String(limit),
    prop: 'extracts|info',
    exintro: '1', // 只取條目開頭的摘要
    explaintext: '1', // 純文字，不要 HTML
    exchars: '400',
    inprop: 'url',
    variant: 'zh-tw', // 轉成繁體
    format: 'json',
  });
  const data = JSON.parse(await fetchText(`https://zh.wikipedia.org/w/api.php?${params}`));

  return Object.values(data.query?.pages ?? {})
    .sort((a, b) => a.index - b.index) // 依搜尋相關度排序
    .map((page) => ({
      source: '維基百科',
      title: page.title,
      snippet: page.extract ?? '',
      url: page.fullurl,
      date: '',
    }));
}

/* ---------- 小工具 ---------- */

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}：${url.slice(0, 60)}`);
  return res.text();
}

const tag = (xml, name) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '';

function decodeXml(text) {
  return text
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const truncate = (s = '', n) => (s.length > n ? `${s.slice(0, n)}…` : s).replace(/\s+/g, ' ');

/** 轉成台灣時間的 YYYY-MM-DD */
function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
}
