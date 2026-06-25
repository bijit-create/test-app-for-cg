import React, { useState, useRef } from 'react';
import { generateIndianAudio } from './services/ttsService';
import { analyzeDocument } from './services/aiService';

const CARD_STYLE = "bg-white rounded-3xl shadow-2xl border border-slate-100 p-10 transition-all w-full max-w-xl";
const PRIMARY_BUTTON = "w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-8 rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [openAIKey, setOpenAIKey] = useState<string>("");
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setHtmlContent(await selectedFile.text());
      setStatus('idle');
      setDownloadUrl(null);
    }
  };

  const processFile = async () => {
    if (!htmlContent) return;
    setStatus('processing');
    setProgress("Analyzing document content...");

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      // Step 1: Try to find data-script attributes
      const scriptElements = Array.from(doc.querySelectorAll('[data-script]'));
      let uniqueTexts = Array.from(new Set(scriptElements.map(el => el.getAttribute('data-script') || "").filter(t => t.trim().length > 0)));

      // Step 2: Fallback - Look for hardcoded script objects in JS
      if (uniqueTexts.length === 0) {
        const scriptTags = doc.querySelectorAll('script');
        scriptTags.forEach(s => {
          const content = s.textContent || "";
          const matches = content.match(/"([^"]{30,})"/g); // Look for long quoted strings which are likely narration
          if (matches) {
            matches.forEach(m => uniqueTexts.push(m.replace(/^"|"$/g, "")));
          }
        });
        uniqueTexts = Array.from(new Set(uniqueTexts));
      }

      // Step 3: AI Fallback - If still no narration text, ask Gemini to generate them based on HTML structure
      if (uniqueTexts.length === 0) {
        setProgress("No narration markers found. AI is analyzing the page to create a custom script...");
        const aiResponse = await analyzeDocument(htmlContent);
        
        // Extract the narration parts (lines of text)
        const narrationMatch = aiResponse.match(/Narration Script:([\s\S]*?)(?=3\.|Key Takeaways:|$)/i);
        const scriptBody = narrationMatch ? narrationMatch[1] : aiResponse;
        
        // Split by sentences or paragraphs to create chunks
        uniqueTexts = scriptBody.split(/[.!?]\s+|\n/)
          .map(t => t.trim())
          .filter(t => t.length > 20); // Only keep substantial sentences
      }

      if (uniqueTexts.length === 0) {
        throw new Error("Could not find or generate any narration text for this file.");
      }

      const audioMap: Record<string, string> = {};
      
      for (let i = 0; i < uniqueTexts.length; i++) {
        const text = uniqueTexts[i];
        setProgress(`Generating Audio (${i + 1}/${uniqueTexts.length})...`);
        
        // Pass the optional OpenAI key to the service
        const audioUri = await generateIndianAudio(text, openAIKey);
        
        if (audioUri) {
          audioMap[text] = audioUri;
        }
        // Delay to be gentle on APIs
        await new Promise(r => setTimeout(r, 2000));
      }

      setProgress("Embedding voice audio...");

      // The Polyfill intercepts the existing narration logic in the uploaded file
      const polyfill = `
<script>
(function() {
  const __aiAudioMap = ${JSON.stringify(audioMap)};
  const __audioElement = new Audio();
  
  // High-level interception of speech synthesis
  const originalSpeak = window.speechSynthesis.speak;
  window.speechSynthesis.speak = function(utterance) {
    const text = utterance.text.trim();
    if (__aiAudioMap[text]) {
      console.log("Playing AI Voice");
      __audioElement.src = __aiAudioMap[text];
      __audioElement.play().catch(() => originalSpeak.call(window.speechSynthesis, utterance));
      __audioElement.onended = () => { if (utterance.onend) utterance.onend(); };
    } else {
      originalSpeak.call(window.speechSynthesis, utterance);
    }
  };

  // Specific interception for files using the 'speakScript' pattern
  const originalSpeakScript = window.speakScript;
  if (typeof originalSpeakScript === 'function') {
    window.speakScript = function() {
      // Find current active slide's script
      const activeSlide = document.querySelector('.slide-content.active');
      const text = activeSlide ? activeSlide.getAttribute('data-script') : null;
      
      if (text && __aiAudioMap[text]) {
        console.log("AI Voice Intercepted speakScript");
        window.speechSynthesis.cancel();
        __audioElement.pause();
        __audioElement.src = __aiAudioMap[text];
        __audioElement.play();
      } else {
        // Fallback to original logic if text not in map
        originalSpeakScript();
      }
    };
  }
})();
</script>
      `;

      let finalHtml = htmlContent;
      if (finalHtml.includes('</body>')) {
        finalHtml = finalHtml.replace('</body>', `${polyfill}</body>`);
      } else {
        finalHtml += polyfill;
      }

      const blob = new Blob([finalHtml], { type: 'text/html' });
      setDownloadUrl(URL.createObjectURL(blob));
      setStatus('completed');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setProgress(err.message || "An error occurred during voice enhancement.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className={CARD_STYLE}>
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-indigo-900 mb-2">Indian Voice Enhancer</h1>
          <p className="text-slate-500">Upgrade your HTML audio narration to a professional Indian AI voice.</p>
        </div>

        {status === 'idle' && (
          <div className="space-y-8">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-48 border-2 border-dashed border-indigo-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 transition-all group"
            >
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".html" className="hidden" />
              <div className="bg-indigo-100 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform text-2xl">📄</div>
              <p className="font-semibold text-slate-700">{file ? file.name : "Select HTML File"}</p>
              <p className="text-xs text-slate-400 mt-1">Accepts any HTML file</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                OpenAI API Key (Fallback)
              </label>
              <input
                type="password"
                value={openAIKey}
                onChange={(e) => setOpenAIKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
              <p className="text-xs text-slate-400 mt-1">
                Optional: Used as a backup if the Gemini service is busy.
              </p>
            </div>

            {file && (
              <button onClick={processFile} className={PRIMARY_BUTTON}>
                Enhance Narration
              </button>
            )}
          </div>
        )}

        {status === 'processing' && (
          <div className="flex flex-col items-center py-10">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <p className="text-lg font-bold text-indigo-900 text-center px-4">{progress}</p>
            <p className="text-sm text-slate-400 mt-2">Connecting to AI Services...</p>
          </div>
        )}

        {status === 'completed' && (
          <div className="text-center py-6">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">✨</div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Success</h2>
            <p className="text-slate-500 mb-8">The AI voice has been embedded. Download the file below.</p>
            
            <div className="space-y-4">
              <a 
                href={downloadUrl!} 
                download={`indian_voice_${file?.name}`}
                className={PRIMARY_BUTTON}
              >
                Download Enhanced HTML
              </a>
              <button onClick={() => setStatus('idle')} className="text-indigo-600 font-bold hover:underline block w-full">
                Process Another
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-6">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">⚠️</div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Error</h2>
            <p className="text-red-500 mb-8 px-4">{progress}</p>
            <button onClick={() => setStatus('idle')} className={PRIMARY_BUTTON}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}