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
 * 这是一个独立的函数，用于在后台执行长时间运行的Gemini API调用，
 * 并将结果写入我们传递给它的流控制器。
 * @param {object} requestData - 从前端接收的请求数据。
 * @param {TransformStreamDefaultController} controller - 用于将数据推送到响应流的控制器。
 */
async function processAndStreamGeminiResponse(requestData, controller) {
  const startIndex = currentApiKeyIndex;
  let lastError = null;
  let success = false;

  for (let i = 0; i < apiKeys.length; i++) {
    const keyIndex = (startIndex + i) % apiKeys.length;
    const apiKey = apiKeys[keyIndex];
    
    console.log(`Attempting to use API Key #${keyIndex + 1}`);

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const { prompt, history, model: selectedModel, temperature } = requestData;
      
      const generationConfig = {
          temperature: temperature !== undefined ? parseFloat(temperature) : 1,
      };
      const modelToUse = selectedModel || "gemini-2.5-flash-lite-preview-06-17";
      
      const model = genAI.getGenerativeModel({ model: modelToUse, generationConfig });
      const chat = model.startChat({ history: history || [] });
      
      // 我们只处理流式传输的情况，因为这是核心需求
      const result = await chat.sendMessageStream(prompt);

      // 将Gemini返回的流传输到我们的响应流中
      for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          controller.enqueue(new TextEncoder().encode(chunkText));
      }

      currentApiKeyIndex = (keyIndex + 1) % apiKeys.length;
      success = true;
      break; // 成功后跳出循环

    } catch (error) {
      console.error(`Error with API Key #${keyIndex + 1}:`, error.message);
      lastError = error;
      // 不要在这里关闭流，继续尝试下一个key
    }
  }

  if (!success) {
    console.error('All API keys failed.', lastError);
    const errorMessage = `\n\n**抱歉，出错了。**\n**错误详情:** ${lastError.message}`;
    controller.enqueue(new TextEncoder().encode(errorMessage));
  }

  // 所有操作完成后，关闭流
  controller.close();
}


// --- 新的主处理函数 ---
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const requestData = await req.json();
  if (!requestData.prompt) {
    return new Response('Bad Request: Missing prompt.', { status: 400 });
  }

  // 1. 创建一个TransformStream。这是一个强大的工具，可以让我们控制进出流的数据。
  // 它的 `readable` 端将立即返回给客户端，而 `writable` 端将用于接收后台任务的数据。
  const stream = new TransformStream({
    start(controller) {
      // 2. 这是流开始时要做的第一件事。我们立即推送一个“思考中”的消息。
      // 注意：我们不在这里添加 "思考中..." 文本，因为前端的 appendMessage 函数
      // 已经为 'loading' 状态实现了这个UI。我们只需确保在真正的内容来临前，
      // 前端有时间渲染它的加载状态。如果需要强制发送初始文本，可以在这里 enqueue。
    }
  });

  // 3. 在后台调用我们耗时的函数。我们不使用 `await`，
  // 这样主函数就可以立即继续执行并返回响应。
  processAndStreamGeminiResponse(requestData, stream.writable.getWriter());

  // 4. 立即返回响应！Vercel的超时计时器到此为止。
  // 响应的正文是流的 `readable` 部分。客户端现在会保持一个开放的连接，
  // 等待数据被推送到这个流中。
  return new Response(stream.readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
