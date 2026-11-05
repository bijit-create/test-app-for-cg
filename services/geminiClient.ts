// Browser-side client for the Gemini proxy at /api/gemini.
// It mirrors the small slice of the @google/genai SDK surface this app uses
// (ai.models.generateContent) without bundling the SDK or any API key.
import type { GenerateContentParameters, GenerateContentResponse } from "@google/genai";

/**
 * Shape of the JSON the proxy returns: the SDK's GenerateContentResponse
 * serialised to JSON with the getter-backed convenience fields copied onto it.
 */
export type ProxiedGenerateContentResponse = Omit<
  GenerateContentResponse,
  "text" | "data" | "functionCalls" | "executableCode" | "codeExecutionResult"
> & {
  text: string | null;
  data: string | null;
  functionCalls: GenerateContentResponse["functionCalls"] | null;
  executableCode: string | null;
  codeExecutionResult: string | null;
};

export class GeminiProxyError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GeminiProxyError";
    this.status = status;
  }
}

async function callProxy<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
  });

  if (!res.ok) {
    let message = `Gemini proxy request failed (${res.status})`;
    try {
      const payload = await res.json();
      if (payload && typeof payload.error === "string") message = payload.error;
    } catch {
      // body was not JSON; keep the generic message
    }
    throw new GeminiProxyError(message, res.status);
  }

  return (await res.json()) as T;
}

export const ai = {
  models: {
    generateContent: (params: GenerateContentParameters) =>
      callProxy<ProxiedGenerateContentResponse>("generateContent", params),
  },
};

export default ai;
