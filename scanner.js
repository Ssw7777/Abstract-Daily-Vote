const fs = require('fs');
const axios = require('axios');
const http = require('http');
const https = require('https');

// 【极速核心】开启 Keep-Alive，复用 TCP 链接，大幅度降低握手延迟
const axiosInstance = axios.create({
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true }),
    timeout: 20000 // 20秒超时
});

// 你的 3 个 API Key
const API_KEYS = ["BNQ1DZYHBGF5V8J88C7XZU3MPHYWNA6GWH", "8EFC3KPEUXF8YXFB7CKSGIICA2KRACD67W", "C5X74HZZR164IDTN4HCZMN7Z76RCYYCHGD"];
const CONTRACT = "0x3B50dE27506f0a8C1f4122A1e6F470009a76ce2A".toLowerCase();
let keyIndex = 0;

function getApiKey() {
    const key = API_KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % API_KEYS.length;
    return key;
}

// 连续签到计算逻辑 (维持原样)
function calculateStreak(txs) {
    if (!txs || txs.length === 0) return 0;
    const signedDays = new Set();
    txs.forEach(tx => {
        if (tx.isError === "0" && tx.to.toLowerCase() === CONTRACT) {
            const ts = parseInt(tx.timeStamp);
            const dateStr = new Date((ts - 23 * 3600) * 1000).toISOString().split('T')[0];
            signedDays.add(dateStr);
        }
    });
    if (signedDays.size === 0) return 0;
    const nowTs = Math.floor(Date.now() / 1000);
    const todayStr = new Date((nowTs - 23 * 3600) * 1000).toISOString().split('T')[0];
    const yesterdayStr = new Date((nowTs - 23 * 3600 - 86400) * 1000).toISOString().split('T')[0];
    let checkDate = signedDays.has(todayStr) ? todayStr : (signedDays.has(yesterdayStr) ? yesterdayStr : null);
    if (!checkDate) return 0;
    let streak = 0;
    let currentIterDate = new Date(checkDate);
    while (true) {
        const dateKey = currentIterDate.toISOString().split('T')[0];
        if (signedDays.has(dateKey)) {
            streak++;
            currentIterDate.setDate(currentIterDate.getDate() - 1);
        } else { break; }
    }
    return streak;
}

async function start() {
    try {
        const addresses = JSON.parse(fs.readFileSync('./user.json', 'utf8'));
        const results = [];
        console.log(`🚀 开启极速模式：总计扫描 ${addresses.length} 个地址...`);

        // 【极速配置】3个Key共享，并发12个，确保不超过 15次/秒 的红线
        const batchSize = 12; 
        
        for (let i = 0; i < addresses.length; i += batchSize) {
            const batch = addresses.slice(i, i + batchSize);
            
            const promises = batch.map(async addr => {
                let streak = -1;
                let retries = 3;
                while (streak === -1 && retries > 0) {
                    try {
                        const url = `https://api.etherscan.io/v2/api?chainid=2741&module=account&action=txlist&address=${addr}&sort=desc&apikey=${getApiKey()}`;
                        // 使用带有 Keep-Alive 的实例
                        const resp = await axiosInstance.get(url);
                        
                        if (resp.data.status === "1") {
                            streak = calculateStreak(resp.data.result);
                        } else if (resp.data.message === "No transactions found") {
                            streak = 0;
                        } else {
                            throw new Error("API Limit");
                        }
                    } catch (e) {
                        retries--;
                        if (retries > 0) await new Promise(r => setTimeout(r, 2000)); // 只有被限制时才罚站 2 秒
                        else streak = 0; 
                    }
                }
                return { address: addr, streak };
            });

            const batchResults = await Promise.all(promises);
            results.push(...batchResults);
            
            // 为了防止日志太多卡死控制台，每处理 120 个地址打印一次进度
            if (i % 120 === 0 || i + batchSize >= addresses.length) {
                console.log(`⚡ 极速狂飙中... 进度: ${Math.min(i + batchSize, addresses.length)} / ${addresses.length}`);
            }

            // 【精准限速】每次并发12个请求后，强制只等 1 秒（因为3个Key加起来1秒能承受15个请求）
            await new Promise(r => setTimeout(r, 1000)); 
        }

        fs.writeFileSync('./results.json', JSON.stringify(results, null, 2));
        console.log("🎉 所有数据极速扫描完成！已生成 results.json");
        
    } catch (error) {
        console.error("严重错误:", error);
        process.exit(1);
    }
}

start();
