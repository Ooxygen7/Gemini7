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
    // 从请求中同时获取 prompt 和 history
    const { prompt, history } = await req.json();

    if (!prompt) {
      return new Response('Bad Request: Missing prompt.', { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    // ✅ 核心改动：使用历史记录开启一个聊天会话
    const chat = model.startChat({
      history: history || [], // 如果没有历史记录，则使用空数组
    });

    // ✅ 核心改动：使用 chat.sendMessageStream 来发送带有上下文的新消息
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

  } catch (error) {
    console.error('Error in stream generation:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
