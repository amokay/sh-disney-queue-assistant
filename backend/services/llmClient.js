/**
 * OpenAI 兼容 Chat Completions（JSON 模式）。
 *
 * 默认走集团 **FAI 网关**（本地/日常域名）：
 *   POST https://trip-llm.alibaba-inc.com/api/fai/v1/chat/completions
 *
 * 环境变量（任选其一作为 Bearer Token，一般为 `fai-2-***`）：
 *   FAI_LLM_API_KEY（推荐） / LLM_API_KEY / OPENAI_API_KEY
 *
 * ⚠️ 勿把 Google AI Studio 的 Gemini API Key 直接填在这里；FAI 网关只认 fai-2- 应用令牌。
 * 若报「应用校验失败 / app validation failed」，请向 FAI 控制台申请正确令牌。
 *
 * 可选：
 *   LLM_BASE_URL — 默认已指向 FAI OpenAI 兼容前缀，勿再带 /chat/completions
 *   LLM_MODEL    — 默认 gemini-2.5-pro（须在 FAI 网关已开通的模型列表中）
 */

const DEFAULT_FAI_BASE = "https://trip-llm.alibaba-inc.com/api/fai/v1";

export function hasLlmConfigured() {
  return Boolean(
    process.env.FAI_LLM_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY
  );
}

function resolveApiKey() {
  return (
    process.env.FAI_LLM_API_KEY ||
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ""
  );
}

/** @param {string} text */
function parseJsonFromLlmText(text) {
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("LLM 返回内容不是合法 JSON");
  }
}

/**
 * @param {string} system
 * @param {string} user
 * @param {boolean} jsonMode
 */
async function chatJsonOnce(system, user, jsonMode) {
  const key = resolveApiKey();
  if (!key) return null;

  const base = (process.env.LLM_BASE_URL || DEFAULT_FAI_BASE).replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "gemini-2.5-pro";

  const body = {
    model,
    temperature: 0.4,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      j?.error?.message ||
      j?.message ||
      (typeof j?.error === "string" ? j.error : null) ||
      `LLM HTTP ${res.status}`;
    throw new Error(msg);
  }
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error("LLM 无返回内容");
  return parseJsonFromLlmText(text);
}

/**
 * @param {string} system
 * @param {string} user
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function chatJson(system, user) {
  try {
    return await chatJsonOnce(system, user, true);
  } catch (e) {
    const msg = String(e?.message || e);
    const retryPlain =
      /response_format|json_object|unsupported|not support|invalid/i.test(msg) ||
      msg.includes("LLM 返回内容不是合法 JSON");
    if (retryPlain) {
      return await chatJsonOnce(system, user, false);
    }
    throw e;
  }
}

/**
 * 启动时自检提示（不阻断服务）
 * @returns {{ configured: boolean, keyLooksLikeFai: boolean, model: string, hint?: string }}
 */
export function llmConfigStatus() {
  const key = resolveApiKey();
  const model = process.env.LLM_MODEL || "gemini-2.5-pro";
  if (!key) {
    return { configured: false, keyLooksLikeFai: false, model, hint: "未配置 FAI_LLM_API_KEY" };
  }
  const keyLooksLikeFai = key.startsWith("fai-2-");
  let hint;
  if (!keyLooksLikeFai) {
    hint =
      "当前密钥不是 fai-2- 开头：FAI 网关通常不接受 Google Gemini 原生 API Key，请到 FAI/trip-llm 申请应用令牌";
  }
  return { configured: true, keyLooksLikeFai, model, hint };
}
