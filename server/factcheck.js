/**
 * 功能 5 的主流程：RAG（Retrieval-Augmented Generation，檢索增強生成）
 *
 *   步驟 1  產生關鍵字：請 Gemini 把訊息轉成 1～3 組搜尋關鍵字
 *   步驟 2  檢索資料：用關鍵字去 Google 新聞、Cofacts、維基百科查最新資料（search.js）
 *   步驟 3  判斷真偽：把「訊息 + 檢索到的資料」一起交給 Gemini，要求它根據資料判斷
 *
 * 模型的知識停在訓練資料的截止日，但步驟 2 查到的是「現在」的資料，
 * 所以 Gemini 能根據即時的事實回答，而且每個結論都能對應到實際的來源。
 */
import { askGemini, GEMINI_MODEL } from './gemini.js';
import { searchAll } from './search.js';
import {
  QUERY_SYSTEM_PROMPT,
  QUERY_SCHEMA,
  buildQueryPrompt,
  JUDGE_SYSTEM_PROMPT,
  VERDICT_SCHEMA,
  buildJudgePrompt,
} from './prompt.js';

export async function factCheck(message) {
  // 步驟 1：產生檢索字詞（核心主張、新聞關鍵字、維基百科條目）
  const terms = await askGemini({
    system: QUERY_SYSTEM_PROMPT,
    input: buildQueryPrompt(message),
    schema: QUERY_SCHEMA,
    thinkingLevel: 'low', // 產生關鍵字是簡單任務，不需要深度思考，回應比較快
  });
  const clean = (list, max) => list.map((s) => s.trim()).filter(Boolean).slice(0, max);
  const queries = clean(terms.queries, 3);
  const wikiTerms = clean(terms.wiki_terms, 2);
  const claim = terms.claim.trim() || message.slice(0, 50);
  if (queries.length === 0) queries.push(claim); // 保險：至少用核心主張搜尋一次

  // 步驟 2：檢索資料
  const documents = await searchAll({ claim, queries, wikiTerms });

  // 步驟 3：根據資料判斷
  const verdict = await askGemini({
    system: JUDGE_SYSTEM_PROMPT,
    input: buildJudgePrompt(message, documents),
    schema: VERDICT_SCHEMA,
  });

  // 模型回傳的是資料編號（從 1 開始），換回實際的資料；不存在的編號直接丟掉，
  // 所以畫面上的每個來源都一定是真的檢索到的，模型沒辦法編造網址
  const sources = [...new Set(verdict.source_ids)]
    .map((id) => documents[id - 1])
    .filter(Boolean);

  return { model: GEMINI_MODEL, claim, queries, wikiTerms, documents, verdict, sources };
}
