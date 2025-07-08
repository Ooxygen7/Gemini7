const { GoogleGenerativeAI } = require('@google/generative-ai');

// 从环境变量中初始化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const config = {
  runtime: 'edge', // Vercel 推荐流式传输使用 Edge Runtime
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { prompt } = await req.json();
    if (!prompt) {
      return new Response('Bad Request: Missing prompt.', { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    // 发起流式请求
    const result = await model.generateContentStream(prompt);

    // 创建一个可读流来将 Gemini 的输出转发给前端
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          // 将每个文本块编码并推送到流中
          controller.enqueue(new TextEncoder().encode(chunkText));
        }
        controller.close();
      },
    });

    // 将流作为响应返回
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });

  } catch (error) {
    console.error('Error in stream generation:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
