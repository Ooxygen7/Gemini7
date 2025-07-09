export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { code } = await req.json();

    // 从环境变量中读取正确的密码和安全密钥
    const correctCode = process.env.UNLOCK_CODE;
    const authToken = process.env.AUTH_TOKEN;

    // 检查密码是否正确
    if (code === correctCode) {
      // 密码正确，返回我们预设的安全密钥作为“通行证”
      return new Response(JSON.stringify({ success: true, token: authToken }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      // 密码错误
      return new Response(JSON.stringify({ success: false, message: 'Invalid code' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    return new Response('Internal Server Error', { status: 500 });
  }
}