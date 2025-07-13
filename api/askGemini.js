const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // 从请求中获取 stream 标志!
    const { prompt, history, model: selectedModel, stream: useStream } = await req.json();

    if (!prompt) {
      return new Response('Bad Request: Missing prompt.', { status: 400 });
    }

    const modelToUse = selectedModel || "gemini-2.5-flash-lite-preview-06-17";
    const model = genAI.getGenerativeModel({ model: modelToUse });

    const chat = model.startChat({
      history: history || [],
    });

    // 根据 useStream 的值决定如何调用API
    if (useStream) {
      // --- 流式处理 ---
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
      // --- 非流式处理 ---
      const result = await chat.sendMessage(prompt);
      const response = result.response;
      const text = response.text();
      // 以JSON格式返回完整的响应
      return new Response(JSON.stringify({ text }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Error in generation:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
