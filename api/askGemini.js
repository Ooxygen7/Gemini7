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
    // ✅ 核心改动：从请求中额外获取 model 名称
    const { prompt, history, model: selectedModel } = await req.json();

    if (!prompt) {
      return new Response('Bad Request: Missing prompt.', { status: 400 });
    }

    // 如果前端没有提供模型名称，则使用一个默认的稳定模型
    const modelToUse = selectedModel || "gemini-2.5-flash";

    // ✅ 核心改动：使用前端传来的模型名称来初始化模型
    const model = genAI.getGenerativeModel({ model: modelToUse });

    const chat = model.startChat({
      history: history || [],
    });

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
