const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- API Key Polling Logic ---
// 1. Read all potential API keys from environment variables.
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
  process.env.GEMINI_API_KEY_10
  // Add more keys here if you have them, e.g., process.env.GEMINI_API_KEY_4
].filter(key => key); // 2. Filter out any keys that are not set.

if (apiKeys.length === 0) {
  throw new Error("No GEMINI_API_KEY environment variables found. Please set at least one, e.g., GEMINI_API_KEY_1.");
}

let currentApiKeyIndex = 0;

// --- Vercel Edge Function Config ---
export const config = {
  runtime: 'edge',
};

/**
 * Generates a response from the Gemini API using a specific API key.
 * @param {string} apiKey The API key to use for this request.
 * @param {object} requestData The data from the original request.
 * @returns {Promise<Response>} A promise that resolves to the API response.
 */
async function generateResponse(apiKey, { prompt, history, model: selectedModel, stream: useStream }) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelToUse = selectedModel || "gemini-2.5-flash-lite-preview-06-17";
    const model = genAI.getGenerativeModel({ model: modelToUse });

    const chat = model.startChat({
        history: history || [],
    });

    if (useStream) {
        const result = await chat.sendMessageStream(prompt);
        const stream = new ReadableStream({
            async start(controller) {
                for await (const chunk of result.stream) {
                    const chunkText = chunk.text();
                    controller.enqueue(new TextEncoder().encode(chunkText));
                }
                controller.close();
            },
        });
        return new Response(stream, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    } else {
        const result = await chat.sendMessage(prompt);
        const response = result.response;
        const text = response.text();
        return new Response(JSON.stringify({ text }), {
            headers: { 'Content-Type': 'application/json' },
        });
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

  const startIndex = currentApiKeyIndex;
  let lastError = null;

  // Loop through API keys starting from the current one, allowing for retries.
  for (let i = 0; i < apiKeys.length; i++) {
    const keyIndex = (startIndex + i) % apiKeys.length;
    const apiKey = apiKeys[keyIndex];
    
    console.log(`Attempting to use API Key #${keyIndex + 1}`);

    try {
      const response = await generateResponse(apiKey, requestData);
      
      // If successful, update the index for the next request and return the response.
      currentApiKeyIndex = (keyIndex + 1) % apiKeys.length;
      return response;

    } catch (error) {
      console.error(`Error with API Key #${keyIndex + 1}:`, error.message);
      lastError = error;
      // The loop will automatically continue to the next key.
    }
  }

  // If all keys have failed
  console.error('All API keys failed.', lastError);
  return new Response(`Internal Server Error: All API keys failed. Last error: ${lastError.message}`, { status: 500 });
}