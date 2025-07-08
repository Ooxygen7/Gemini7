// api/askGemini.js

const axios = require('axios');

// Vercel 会处理这个函数，并传入请求(req)和响应(res)对象
module.exports = async (req, res) => {
  // 设置CORS头，允许所有来源访问（或者指定你的前端域名）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理浏览器的CORS预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // 确保是POST请求
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const userPrompt = req.body.prompt;
    if (!userPrompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    // 从 Vercel 的环境变量中安全地获取 API Key
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${AIzaSyDZ5u9uKJCsqCOX6yQQiOnbDst8aKvM9Tw}`;

    const geminiResponse = await axios.post(API_URL, {
      contents: [{
        parts: [{ text: userPrompt }],
      }],
    });

    const responseText = geminiResponse.data.candidates[0].content.parts[0].text;
    res.status(200).json({ reply: responseText });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};