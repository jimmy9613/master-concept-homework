/**
 * 後端伺服器
 *   1. 提供 public/ 裡的網頁（功能 1~5 的前端）
 *   2. 提供 API：POST /api/fact-check，由伺服器檢索資料並呼叫 Gemini（流程在 factcheck.js）
 *
 * 為什麼一定要有後端？
 *   Google Maps 的金鑰本來就設計給前端用（靠「網站限制」保護）；
 *   但 Gemini 的 API 金鑰一旦放在前端，任何人按 F12 就能複製去用、耗掉你的額度。
 *   所以 Gemini 金鑰只放在伺服器的 .env，瀏覽器只跟我們自己的伺服器溝通。
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { factCheck } from './factcheck.js';
import { GEMINI_MODEL } from './gemini.js';
import { FactCheckError } from './prompt.js';

const PORT = Number(process.env.PORT) || 8000;
const MAX_MESSAGE_LENGTH = 2000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const hasKey = () => Boolean(process.env.GEMINI_API_KEY);

const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(express.static(PUBLIC_DIR));

// 讓前端知道使用哪個模型、是否已設定金鑰（只回傳「有沒有」，不回傳金鑰本身）
app.get('/api/status', (req, res) => {
  res.json({ model: GEMINI_MODEL, configured: hasKey() });
});

app.post('/api/fact-check', async (req, res) => {
  const { message } = req.body ?? {};
  const text = typeof message === 'string' ? message.trim() : '';

  // 後端一定要自己檢查輸入，不能只靠前端檢查
  if (!text) return res.status(400).json({ error: '請輸入要查核的訊息。' });
  if (text.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `訊息太長，請控制在 ${MAX_MESSAGE_LENGTH} 字以內。` });
  }
  if (!hasKey()) {
    return res.status(503).json({ error: '伺服器尚未設定 GEMINI_API_KEY，請在 .env 填入金鑰後重新執行 npm start。' });
  }

  const startedAt = Date.now();
  try {
    const result = await factCheck(text);
    res.json({ elapsedMs: Date.now() - startedAt, ...result });
  } catch (err) {
    console.error('[fact-check]', err.cause ?? err); // 印出原始錯誤，方便除錯
    const status = err instanceof FactCheckError ? err.status : 500;
    const error = err instanceof FactCheckError ? err.message : '伺服器發生未預期的錯誤，請查看終端機的錯誤訊息。';
    res.status(status).json({ error });
  }
});

app.listen(PORT, () => {
  console.log(`伺服器已啟動：http://localhost:${PORT}`);
  console.log(`  Gemini 模型：${GEMINI_MODEL}  ${hasKey() ? '✓ 已設定金鑰' : '✗ 未設定 GEMINI_API_KEY（功能 5 無法使用）'}`);
});
