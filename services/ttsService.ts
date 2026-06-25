import { GoogleGenAI, Modality } from "@google/genai";

/**
 * Decodes base64 string to Uint8Array
 */
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes Uint8Array to base64 string
 */
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Wraps raw PCM data (16-bit, 24kHz, mono) into a WAV container
 */
export const pcmToWavBase64 = (pcmBase64: string): string => {
  const pcmData = decode(pcmBase64);
  const dataSize = pcmData.length;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF identifier
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, 24000, true);
  view.setUint32(28, 24000 * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  const wavBuffer = new Uint8Array(header.byteLength + pcmData.byteLength);
  wavBuffer.set(new Uint8Array(header), 0);
  wavBuffer.set(pcmData, header.byteLength);

  return encode(wavBuffer);
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fallback: Generate audio using OpenAI if Gemini fails.
 * Note: OpenAI TTS 'onyx' voice is used as a backup for a deep, professional tone.
 */
async function generateOpenAIAudio(text: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: "onyx", // Deep, professional voice
        response_format: "wav"
      })
    });

    if (!response.ok) {
      console.warn("OpenAI API failed with status:", response.status);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    return `data:audio/wav;base64,${encode(bytes)}`;
  } catch (err) {
    console.error("OpenAI TTS Error:", err);
    return null;
  }
}

/**
 * Generates an Indian voice audio for a given piece of text.
 * Falls back to OpenAI if provided key exists and Gemini fails.
 */
export const generateIndianAudio = async (text: string, openAIKey?: string): Promise<string | null> => {
  if (!text || !text.trim()) return null;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Speak with a professional Indian English accent: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Pcm = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Pcm) return null;
      
      return `data:audio/wav;base64,${pcmToWavBase64(base64Pcm)}`;
    } catch (err: any) {
      // Handle Rate Limit (429) errors with backoff
      const isRateLimit = err.message?.includes('429') || err.status === 429;
      
      if (isRateLimit && attempt < maxRetries - 1) {
        console.warn(`Rate limit hit (429). Retrying in ${(attempt + 1) * 2}s...`);
        await wait((attempt + 1) * 2000);
        attempt++;
        continue;
      }
      
      // Check if we should fallback to OpenAI on final failure or non-retryable error
      if (openAIKey && (attempt === maxRetries - 1 || !isRateLimit)) {
        console.warn("Gemini Failed, switching to OpenAI Fallback...");
        return await generateOpenAIAudio(text, openAIKey);
      }
      
      console.error("Gemini TTS Error:", err);
      return null;
    }
  }
  
  // If loop exits without returning, try fallback one last time if key exists
  if (openAIKey) {
     return await generateOpenAIAudio(text, openAIKey);
  }

  return null;
};
