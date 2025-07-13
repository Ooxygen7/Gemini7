import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@vercel/kv';

// --- Rate Limiting Setup ---
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Define daily limits per model for a single IP address
const DAILY_LIMITS = {
  "gemini-2.5-pro": 1,
  "gemini-2.5-flash": 2,
};

// --- API Key Polling Logic ---
const apiKeys = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
  process.env.GEMINI_API_KEY_6,
  process.env.GEMINI_API_KEY_7,
  process.env.GEMINI_API_KEY_8,
  process.env.GEMINI_API_KEY_9,
  process.env.GEMINI_API_KEY_10,
].filter(key => key); 

if (apiKeys.length === 0) {
  throw new Error("No GEMINI_API_KEY environment variables found.");
}

let currentApiKeyIndex = 0;

// --- Vercel Edge Function Config ---
export const config = {
  runtime: 'edge',
};

/**
 * Generates a response from the Gemini API using a specific API key.
 */
async function generateResponse(apiKey, { prompt, history, model: selectedModel, stream: useStream, temperature }) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const generationConfig = {
        temperature: temperature !== undefined ? parseFloat(temperature) : 1,
    };
    const model = genAI.getGenerativeModel({ 
        model: selectedModel,
        generationConfig
    });
    const chat = model.startChat({ history: history || [] });

    if (useStream) {
        const result = await chat.sendMessageStream(prompt);
        const stream = new ReadableStream({
            async start(controller) {
                for await (const chunk of result.stream) {
                    controller.enqueue(new TextEncoder().encode(chunk.text()));
                }
                controller.close();
            },
        });
        return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } else {
        const result = await chat.sendMessage(prompt);
        const text = result.response.text();
        return new Response(JSON.stringify({ text }), { headers: { 'Content-Type': 'application/json' } });
    }
}

// --- Main Handler ---
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const requestData = await req.json();
  if (!requestData.prompt) {
    return new Response('Bad Request: Missing prompt.', { status: 400 });
  }
  
  const modelToUse = requestData.model || "gemini-2.5-flash-lite-preview-06-17";

  // --- IP Rate Limiting Logic ---
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const today = new Date().toISOString().split('T')[0];
  const rateLimitKey = `rate-limit:${ip}:${modelToUse}:${today}`;
  
  try {
    const usage = await kv.get(rateLimitKey) || 0;
    const limit = DAILY_LIMITS[modelToUse] || DAILY_LIMITS.default;

    if (usage >= limit) {
      console.warn(`Rate limit exceeded for IP: ${ip} on model: ${modelToUse}`);
      
      const ttl = await kv.ttl(rateLimitKey);
      const hours = Math.floor(ttl / 3600);
      const minutes = Math.floor((ttl % 3600) / 60);
      const resetTimeMessage = `将在 ${hours} 小时 ${minutes} 分钟后重置。`;

      return new Response(JSON.stringify({ 
          error: `您对 ${modelToUse} 模型的使用次数已达今日上限 (${limit}次)。${resetTimeMessage}` 
      }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
      });
    }

    const newUsage = await kv.incr(rateLimitKey);
    // If this was the first usage for the key, set the expiration
    if (newUsage === 1) {
        await kv.expire(rateLimitKey, 86400); // 86400 seconds = 24 hours
    }

  } catch (kvError) {
      console.error("Vercel KV error:", kvError);
      // If KV store fails, we proceed without rate limiting to not block users.
  }
  // --- End of IP Rate Limiting Logic ---


  // --- API Key Polling & Retry Logic ---
  const startIndex = currentApiKeyIndex;
  let lastError = null;

  for (let i = 0; i < apiKeys.length; i++) {
    const keyIndex = (startIndex + i) % apiKeys.length;
    const apiKey = apiKeys[keyIndex];
    
    console.log(`Attempting to use API Key #${keyIndex + 1}`);

    try {
      const response = await generateResponse(apiKey, { ...requestData, model: modelToUse });
      currentApiKeyIndex = (keyIndex + 1) % apiKeys.length;
      return response;
    } catch (error) {
      console.error(`Error with API Key #${keyIndex + 1}:`, error.message);
      lastError = error;
    }
  }

  console.error('All API keys failed.', lastError);
  return new Response(`Internal Server Error: All API keys failed. Last error: ${lastError.message}`, { status: 500 });
}
