import { ai } from "./geminiClient";

export const analyzeDocument = async (htmlContent: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [{
      parts: [{
        text: `You are an expert document analyst. Analyze the following HTML content and provide:
        1. A concise summary.
        2. A "Narration Script": Rewrite the key points into a natural, conversational script (around 200 words) meant to be spoken by a professional Indian narrator.
        3. 3-5 key takeaways.
        
        HTML Content:
        ${htmlContent.substring(0, 15000)}` // Limit for safety
      }]
    }],
    config: {
      temperature: 0.7,
      topP: 0.95,
    }
  });

  return response.text ?? "";
};

export const chatWithDocument = async (query: string, context: string, history: {role: string, parts: string}[]) => {
  // Stateless equivalent of ai.chats.create(...).sendMessage(...): prior turns
  // are sent as contents so the proxy only needs to expose generateContent.
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      ...history.map(h => ({ role: h.role, parts: [{ text: h.parts }] })),
      { role: "user", parts: [{ text: query }] },
    ],
    config: {
      systemInstruction: `You are a helpful assistant talking about a specific document. Use the following context to answer questions accurately.
      Context: ${context.substring(0, 10000)}`,
    }
  });

  return response.text ?? "";
};
