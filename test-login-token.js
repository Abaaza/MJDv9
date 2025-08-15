import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000/api';

async function testLogin() {
  try {
    // Login and inspect token
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'abaza@mjd.com',
        password: 'abaza123'
      })
    });
    
    const data = await loginResponse.json();
    console.log('Login response:', JSON.stringify(data, null, 2));
    
    // Decode JWT payload (simple base64 decode)
    if (data.accessToken) {
      const parts = data.accessToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      console.log('\nJWT Payload:', JSON.stringify(payload, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testLogin();