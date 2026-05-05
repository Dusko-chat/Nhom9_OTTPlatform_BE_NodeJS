/**
 * HELPER: Lấy JWT tokens thật từ API để dùng trong integration test
 * Chạy: node scripts/get-test-tokens.js
 * 
 * Output: Tokens được in ra console, copy vào test-group-call-integration.js
 */

'use strict';
require('dotenv').config();

const http = require('http');

const API_URL = process.env.TEST_API_URL || 'http://localhost:8080';

// ==============================================================
// ⚙️  CẤU HÌNH - Thay bằng tài khoản thật trong DB
// ==============================================================
const TEST_ACCOUNTS = [
    { email: process.env.TEST_USER_A_EMAIL || 'useratest@example.com', password: process.env.TEST_USER_A_PASS || 'password123' },
    { email: process.env.TEST_USER_B_EMAIL || 'userbtest@example.com', password: process.env.TEST_USER_B_PASS || 'password123' },
    { email: process.env.TEST_USER_C_EMAIL || 'userctest@example.com', password: process.env.TEST_USER_C_PASS || 'password123' },
];

async function login(email, password) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ email, password });
        const url = new URL(`${API_URL}/api/auth/login`);
        
        const req = http.request({
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function main() {
    console.log('\n🔑 Lấy JWT tokens từ API Login...\n');
    
    const tokens = [];
    const userIds = [];
    
    for (let i = 0; i < TEST_ACCOUNTS.length; i++) {
        const { email, password } = TEST_ACCOUNTS[i];
        try {
            const result = await login(email, password);
            
            // Thử các field name khác nhau (vì API có thể khác nhau)
            const token = result.token || result.accessToken || result.data?.token || result.data?.accessToken;
            const userId = result.userId || result.user?.userId || result.user?.id || result.data?.user?.userId;
            
            if (token) {
                tokens.push(token);
                userIds.push(userId || `unknown-${i}`);
                console.log(`✅ User ${String.fromCharCode(65 + i)} (${email}): Login OK`);
                console.log(`   userId: ${userId}`);
                console.log(`   token : ${token.slice(0, 40)}...`);
            } else {
                console.error(`❌ User ${String.fromCharCode(65 + i)} (${email}): Không lấy được token`);
                console.error(`   Response: ${JSON.stringify(result).slice(0, 200)}`);
                tokens.push(null);
                userIds.push(null);
            }
        } catch (err) {
            console.error(`❌ User ${String.fromCharCode(65 + i)} (${email}): ${err.message}`);
            tokens.push(null);
            userIds.push(null);
        }
        console.log();
    }
    
    const valid = tokens.filter(Boolean);
    if (valid.length < 3) {
        console.error(`\n⚠️  Chỉ lấy được ${valid.length}/3 tokens. Kiểm tra lại tài khoản test.\n`);
        return;
    }
    
    // Lấy một conversationId group thật (từ API nếu cần)
    // Hoặc hardcode convId vào đây nếu đã biết
    const convId = process.env.TEST_CONV_ID || 'YOUR_GROUP_CONV_ID_HERE';
    
    console.log('\n' + '═'.repeat(70));
    console.log('📋 Chạy integration test với tokens thật:');
    console.log('═'.repeat(70));
    console.log(`\nnode scripts/test-group-call-integration.js \\`);
    console.log(`  "${tokens[0]}" \\`);
    console.log(`  "${tokens[1]}" \\`);
    console.log(`  "${tokens[2]}" \\`);
    console.log(`  "${userIds[0]}" \\`);  
    console.log(`  "${convId}"`);
    
    console.log('\n💡 Hoặc set trong .env:');
    console.log(`TEST_USER_A_EMAIL=...`);
    console.log(`TEST_USER_A_PASS=...`);
    console.log(`TEST_USER_B_EMAIL=...`);
    console.log(`TEST_USER_B_PASS=...`);
    console.log(`TEST_USER_C_EMAIL=...`);
    console.log(`TEST_USER_C_PASS=...`);
    console.log(`TEST_CONV_ID=<group_conv_id>`);
}

main().catch(err => {
    console.error('\n💥 Lỗi:', err.message);
    console.error('   → Đảm bảo backend đang chạy: node app.js');
});
