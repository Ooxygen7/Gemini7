const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- API密钥轮询逻辑 (保持不变) ---
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
  throw new Error("No GEMINI_API_KEY environment variables found. Please set at least one, e.g., GEMINI_API_KEY_1.");
}

let currentApiKeyIndex = 0;

// --- Vercel Edge Function 配置 (保持不变) ---
export const config = {
  runtime: 'edge',
};

/**
 * 在后台执行Gemini API调用，并将结果通过流控制器推送。
 * @param {object} requestData - 从前端接收的请求数据。
 * @param {ReadableStreamDefaultController} controller - 流控制器，拥有 .enqueue() 和 .close() 方法。
 */
async function processAndStreamGeminiResponse(requestData, controller) {
  const { prompt, history, model: selectedModel, temperature } = requestData;
  const startIndex = currentApiKeyIndex;
  let lastError = null;
  let success = false;

  for (let i = 0; i < apiKeys.length; i++) {
    const keyIndex = (startIndex + i) % apiKeys.length;
    const apiKey = apiKeys[keyIndex];
    
    console.log(`Attempting to use API Key #${keyIndex + 1}`);

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const generationConfig = {
          temperature: temperature !== undefined ? parseFloat(temperature) : 1,
      };
      const modelToUse = selectedModel || "gemini-2.5-flash-lite-preview-06-17";
      
      const model = genAI.getGenerativeModel({ model: modelToUse, generationConfig });
      const chat = model.startChat({ history: history || [] });
      
      const result = await chat.sendMessageStream(prompt);

      for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          controller.enqueue(new TextEncoder().encode(chunkText));
      }

      currentApiKeyIndex = (keyIndex + 1) % apiKeys.length;
      success = true;
      break; 

    } catch (error) {
      console.error(`Error with API Key #${keyIndex + 1}:`, error.message);
      lastError = error;
    }
  }

  if (!success) {
    console.error('All API keys failed.', lastError);
    const errorMessage = `\n\n**抱歉，所有API密钥均尝试失败。**\n**最后错误:** ${lastError.message}`;
    controller.enqueue(new TextEncoder().encode(errorMessage));
  }

  // 确保所有操作完成后关闭流
  controller.close();
}


// --- 修正后的主处理函数 ---
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const requestData = await req.json();
  if (!requestData.prompt) {
    return new Response('Bad Request: Missing prompt.', { status: 400 });
  }

  // 使用 ReadableStream，它的 start 函数会提供一个带有 .enqueue() 方法的 controller
  const stream = new ReadableStream({
    async start(controller) {
      // 在后台安全地执行耗时任务
      await processAndStreamGeminiResponse(requestData, controller);
    }
  });

  // 立即返回流式响应，避免Vercel超时
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
