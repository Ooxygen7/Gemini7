import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // ✅ 核心改动 1: 从请求中额外获取 model 和 stream 参数
    const { prompt, history, model: selectedModel, stream: streamRequested } = await req.json();

    if (!prompt) {
      return new Response('Bad Request: Missing prompt.', { status: 400 });
    }

    // 如果前端没有提供 stream 参数，默认为 true (开启流式)
    const isStreaming = streamRequested !== false;

    // 如果前端没有提供模型名称，则使用一个默认的稳定模型
    const modelToUse = selectedModel || "gemini-1.5-flash";
    const model = genAI.getGenerativeModel({ model: modelToUse });

    const chat = model.startChat({
      history: history || [],
    });

    // ✅ 核心改动 2: 根据 isStreaming 标志决定执行哪段逻辑
    if (isStreaming) {
      // --- 流式传输逻辑 (保持不变) ---
      const result = await chat.sendMessageStream(prompt);
      const stream = new ReadableStream({
        async start(controller) {
          for await (const chunk of result.stream) {
            // 确保 chunk 和 chunk.text() 都存在
            if (chunk && typeof chunk.text === 'function') {
                const chunkText = chunk.text();
                controller.enqueue(new TextEncoder().encode(chunkText));
            }
          }
          controller.close();
        },
      });
      
      return new Response(stream, {
        headers: { 
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Content-Type-Options': 'nosniff' // 安全头
        },
      });

    } else {
      // --- 非流式传输逻辑 (新) ---
      const result = await chat.sendMessage(prompt);
      const response = result.response;
      const responseText = response.text();

      const jsonResponse = { text: responseText };

      return new Response(JSON.stringify(jsonResponse), {
        status: 200,
        headers: { 
            'Content-Type': 'application/json; charset=utf-8' 
        },
      });
    }

  } catch (error) {
    console.error('Error in Gemini handler:', error);
    // 增加更详细的错误日志
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(`Internal Server Error: ${errorMessage}`, { status: 500 });
  }
}
