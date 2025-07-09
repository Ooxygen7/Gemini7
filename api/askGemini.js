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
    // 增加了对 token 的接收
    const { prompt, history, model: selectedModel, token } = await req.json();

    if (!prompt) {
      return new Response('Bad Request: Missing prompt.', { status: 400 });
    }

    const modelToUse = selectedModel || "gemini-2.5-flash"; // 使用您的模型作为默认

    // ✅ 核心改动：如果请求的是包含 'pro' 的模型，则进行认证
    if (modelToUse.includes('pro')) {
      const correctToken = process.env.AUTH_TOKEN;
      if (token !== correctToken) {
        // 如果 token 不匹配，则拒绝访问
        return new Response('Authentication required for Pro model', { status: 403 });
      }
    }

    const model = genAI.getGenerativeModel({ model: modelToUse });
    const chat = model.startChat({ history: history || [] });
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
    
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error) {
    console.error('Error in stream generation:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}