const fs = require('fs');
const axios = require('axios');

// 配置信息（双引号已加好）
const API_KEYS = ["BNQ1DZYHBGF5V8J88C7XZU3MPHYWNA6GWH", "8EFC3KPEUXF8YXFB7CKSGIICA2KRACD67W", "C5X74HZZR164IDTN4HCZMN7Z76RCYYCHGD"];
const CONTRACT = "0x3B50dE27506f0a8C1f4122A1e6F470009a76ce2A".toLowerCase();
let keyIndex = 0;

function getApiKey() {
    const key = API_KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % API_KEYS.length;
    return key;
}

// 连续签到计算逻辑
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
        // 读取地址文件
        const addresses = JSON.parse(fs.readFileSync('./user.json', 'utf8'));
        const results = [];
        console.log(`开始处理 ${addresses.length} 个地址...`);

        // 每次并发 3 个请求，避免被封 IP
        const batchSize = 3;
        for (let i = 0; i < addresses.length; i += batchSize) {
            const batch = addresses.slice(i, i + batchSize);
            const promises = batch.map(async addr => {
                let streak = -1;
                let retries = 3; // 遇到限制重试3次
                while (streak === -1 && retries > 0) {
                    try {
                        const url = `https://api.etherscan.io/v2/api?chainid=2741&module=account&action=txlist&address=${addr}&sort=desc&apikey=${getApiKey()}`;
                        const resp = await axios.get(url, { timeout: 15000 });
                        
                        if (resp.data.status === "1") {
                            streak = calculateStreak(resp.data.result);
                        } else if (resp.data.message === "No transactions found") {
                            streak = 0;
                        } else {
                            throw new Error("API 限制或报错");
                        }
                    } catch (e) {
                        retries--;
                        if (retries > 0) await new Promise(r => setTimeout(r, 2000));
                        else streak = 0; // 彻底失败记为0
                    }
                }
                return { address: addr, streak };
            });

            const batchResults = await Promise.all(promises);
            results.push(...batchResults);
            
            console.log(`进度: ${Math.min(i + batchSize, addresses.length)} / ${addresses.length}`);
            // 每次请求后稍微停顿一下，保护 API
            await new Promise(r => setTimeout(r, 600)); 
        }

        // 写入结果文件
        fs.writeFileSync('./results.json', JSON.stringify(results, null, 2));
        console.log("🎉 数据扫描完成！已生成 results.json");
        
    } catch (error) {
        console.error("读取 user.json 失败或出现严重错误:", error);
        process.exit(1);
    }
}

start();
