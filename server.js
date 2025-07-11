const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const WebSocket = require('ws');
const { executablePath } = require('puppeteer');

// Cấu hình
const app = express();
const PORT = process.env.PORT || 10000;
const HITCLUB_CREDENTIALS = {
  username: 'testautoget',
  password: 'binhtool90'
};
const WS_URL = 'wss://mynygwais.hytsocesk.com/websocket';

// Thêm plugin chống phát hiện
puppeteer.use(StealthPlugin());

// Biến lưu trữ token
let currentToken = {
  token: null,
  lastUpdated: null,
  status: 'inactive'
};

// Khởi tạo trình duyệt Puppeteer
let browser;
(async () => {
  browser = await puppeteer.launch({
    headless: true,
    executablePath: executablePath(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  });
  console.log('[🚀] Trình duyệt đã sẵn sàng');
})();

// Hàm lấy token mới
async function fetchNewToken() {
  let page;
  try {
    currentToken.status = 'fetching';
    page = await browser.newPage();
    
    // Cấu hình trình duyệt
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    console.log('[🌐] Đang truy cập HitClub...');
    await page.goto('https://i.hit.club/login', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    // Đăng nhập
    console.log('[🔐] Đang đăng nhập...');
    await page.type('input[name="username"]', HITCLUB_CREDENTIALS.username, { delay: random(50, 150) });
    await page.type('input[name="password"]', HITCLUB_CREDENTIALS.password, { delay: random(70, 200) });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]')
    ]);

    // Chờ trang tải xong
    await page.waitForSelector('.game-container', { timeout: 15000 });

    // Lấy token từ WebSocket
    console.log('[🔍] Đang tìm token WebSocket...');
    const token = await page.evaluate(() => {
      return new Promise((resolve) => {
        const originalWebSocket = window.WebSocket;
        window.WebSocket = function(url) {
          const ws = new originalWebSocket(url);
          ws.addEventListener('open', () => {
            if (url.includes('hytsocesk.com/websocket')) {
              const tokenMatch = url.match(/accessToken=([^&]+)/);
              if (tokenMatch) resolve(tokenMatch[1]);
            }
          });
          return ws;
        };
        setTimeout(() => resolve(null), 15000);
      });
    });

    if (token) {
      currentToken = {
        token,
        lastUpdated: new Date(),
        status: 'active'
      };
      console.log(`[✅] Token mới: ${token.substring(0, 10)}...`);
    } else {
      throw new Error('Không tìm thấy token');
    }
  } catch (error) {
    console.error('[❌] Lỗi khi lấy token:', error.message);
    currentToken.status = 'error';
  } finally {
    if (page) await page.close();
    
    // Lên lịch lấy token mới sau 5 phút nếu có lỗi
    if (currentToken.status === 'error') {
      setTimeout(fetchNewToken, 5 * 60 * 1000);
    }
  }
}

// API Endpoints
app.get('/token', (req, res) => {
  res.json({
    token: currentToken.token ? `${currentToken.token.substring(0, 10)}...` : null,
    lastUpdated: currentToken.lastUpdated,
    status: currentToken.status,
    exampleUsage: {
      websocket: {
        url: WS_URL,
        authPacket: [
          1,
          "MiniGame",
          "",
          "",
          {
            agentId: "1",
            accessToken: currentToken.token || "YOUR_TOKEN_HERE",
            reconnect: false
          }
        ]
      }
    }
  });
});

app.get('/refresh', async (req, res) => {
  await fetchNewToken();
  res.redirect('/token');
});

app.get('/', (req, res) => {
  res.send(`
    <h1>HitClub Token Service</h1>
    <p>Endpoints:</p>
    <ul>
      <li><a href="/token">/token</a> - Xem token hiện tại</li>
      <li><a href="/refresh">/refresh</a> - Làm mới token</li>
    </ul>
  `);
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`[🌐] Server đang chạy tại http://localhost:${PORT}`);
  // Lấy token lần đầu khi khởi động
  fetchNewToken();
  // Lên lịch làm mới token mỗi 6 giờ
  setInterval(fetchNewToken, 6 * 60 * 60 * 1000);
});

// Hàm hỗ trợ
function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
      }
