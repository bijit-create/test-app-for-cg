// Vercel Node serverless function that proxies Gemini calls for the browser.
// The Gemini API key lives ONLY here (server-side); it is never sent to the client.
import { GoogleGenAI } from "@google/genai";

// Exactly the ai.models.* methods the client uses. Anything else is rejected.
const ALLOWED_METHODS = ["generateContent"] as const;
type AllowedMethod = (typeof ALLOWED_METHODS)[number];

interface GeminiRequestBody {
  method?: unknown;
  params?: unknown;
}

// Minimal request/response types so we do not need @vercel/node for types.
interface Req {
  method?: string;
  body?: unknown;
}
interface Res {
  status(code: number): Res;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

function parseBody(raw: unknown): GeminiRequestBody | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as GeminiRequestBody;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as GeminiRequestBody;
  return null;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = parseBody(req.body);
  if (!body) {
    res.status(400).json({ error: "Request body must be JSON: { method, params }" });
    return;
  }

  const { method, params } = body;
  if (typeof method !== "string" || !(ALLOWED_METHODS as readonly string[]).includes(method)) {
    res.status(400).json({
      error: `Unsupported method. Allowed: ${ALLOWED_METHODS.join(", ")}`,
    });
    return;
  }
  if (params == null || typeof params !== "object" || Array.isArray(params)) {
    res.status(400).json({ error: "params must be an object" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_1;
  if (!apiKey) {
    res.status(500).json({
      error:
        "Gemini API key is not configured on the server. Set GEMINI_API_KEY in the Vercel project environment variables.",
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response: any = await ai.models[method as AllowedMethod](params as any);

    // The SDK response is a class instance whose convenience accessors
    // (.text, .functionCalls, ...) are getters, so JSON.stringify would drop
    // them. Copy them onto a plain object so the client can read them.
    res.status(200).json({
      ...response,
      text: response.text ?? null,
      data: response.data ?? null,
      functionCalls: response.functionCalls ?? null,
      executableCode: response.executableCode ?? null,
      codeExecutionResult: response.codeExecutionResult ?? null,
    });
  } catch (err: any) {
    const message =
      typeof err?.message === "string" && err.message.length > 0
        ? err.message
        : "Gemini request failed";
    // Never log or return the API key. We also avoid logging request params.
    console.error("Gemini proxy error:", message);
    const status =
      typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ error: message });
  }
}
