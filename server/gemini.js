/**
 * 呼叫 Gemini API（Interactions API，Google 目前建議新專案使用的介面）
 *
 * 只做一件事：送出提示詞，並要求 Gemini 回傳符合 JSON Schema 的結果。
 * 不使用 Gemini 內建的 Google 搜尋工具（Grounding）：那個功能在免費方案沒有額度，
 * 所以改由我們自己檢索資料（search.js），再把資料放進提示詞交給 Gemini 判斷。
 */
import { GoogleGenAI } from '@google/genai';
import { FactCheckError } from './prompt.js';

// 預設用 Flash-Lite：免費方案每天約 500 次（Flash 系列每天只有約 20 次），每次查證會呼叫 2 次
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

let client;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

/**
 * @param thinkingLevel 思考程度：'low' 較快（適合簡單任務），不指定則用模型預設（較深入）
 */
export async function askGemini({ system, input, schema, thinkingLevel }) {
  let interaction;
  try {
    interaction = await getClient().interactions.create({
      model: GEMINI_MODEL,
      system_instruction: system,
      input,
      response_format: { type: 'text', mime_type: 'application/json', schema }, // 強制輸出符合 schema 的 JSON
      ...(thinkingLevel && { generation_config: { thinking_level: thinkingLevel } }),
      store: false, // 不需要多輪對話，不讓 Google 保存這次的請求與回應
    }, {
      // 自動重試「暫時性」錯誤：連線中斷、Google 伺服器錯誤（5xx），最多重試 2 次。
      // 429（額度用完）不重試：重試也沒用，只會讓使用者多等。
      retries: {
        strategy: 'attempt-count-backoff',
        maxRetries: 2,
        backoff: { initialInterval: 500, maxInterval: 4000, exponent: 2, maxElapsedTime: 15_000 },
        retryConnectionErrors: true,
      },
      retry_codes: ['5XX'],
      timeout_ms: 60_000,
    });
  } catch (err) {
    // 要先檢查逾時：APIConnectionTimeoutError 是 APIConnectionError 的一種
    if (err.name === 'APIConnectionTimeoutError' || err.name === 'RequestTimeoutError') {
      throw new FactCheckError('Gemini 回應逾時，請再試一次。', 504, { cause: err });
    }
    if (err.name === 'APIConnectionError' || err.name === 'ConnectionError') {
      if (isCertificateError(err)) {
        // 防毒軟體（例如 Avast）的 HTTPS 掃描會用自己的憑證攔截連線，Node.js 預設不信任 → 連線失敗
        throw new FactCheckError(
          'HTTPS 憑證驗證失敗（常見原因：防毒軟體攔截 HTTPS 連線）。請用 npm start 啟動，它已加上 --use-system-ca 讓 Node.js 使用 Windows 的憑證。',
          502,
          { cause: err }
        );
      }
      throw new FactCheckError('連不上 Gemini 伺服器（網路連線失敗，已自動重試 2 次），請檢查網路後再試一次。', 502, { cause: err });
    }
    const status = err.status ?? err.statusCode;
    if (status === 400 && /api key/i.test(err.message)) {
      throw new FactCheckError('Gemini API 金鑰無效，請檢查 .env 的 GEMINI_API_KEY。', 401, { cause: err });
    }
    if (status === 429) {
      // Google 的錯誤訊息會寫出是哪種上限（例如 requests per day），直接附上
      throw new FactCheckError(`免費額度已用完或請求太頻繁，請稍後再試。（${err.message}）`, 429, { cause: err });
    }
    throw new FactCheckError(`Gemini API 錯誤${status ? `（${status}）` : ''}：${err.message}`, 502, { cause: err });
  }

  if (interaction.status !== 'completed') {
    throw new FactCheckError(`Gemini 沒有完成回應（status: ${interaction.status}）。`);
  }

  // output_text 是模型輸出的文字；沒有的話，從 model_output 步驟把文字接起來
  const text =
    interaction.output_text ??
    (interaction.steps ?? [])
      .filter((s) => s.type === 'model_output')
      .flatMap((s) => s.content ?? [])
      .map((c) => c.text ?? '')
      .join('');

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new FactCheckError('Gemini 回傳的格式無法解析，請再試一次。', 502, { cause: err });
  }
}

/** 沿著 err.cause 往下找，看底層原因是不是 TLS 憑證錯誤 */
function isCertificateError(err) {
  for (let e = err; e; e = e.cause) {
    if (/CERT|UNABLE_TO_VERIFY|SELF_SIGNED/.test(e.code ?? '')) return true;
  }
  return false;
}
