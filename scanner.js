const fs = require('fs');
const axios = require('axios');
const http = require('http');
const https = require('https');

const axiosInstance = axios.create({
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true }),
    timeout: 20000
});

const API_KEYS = ["BNQ1DZYHBGF5V8J88C7XZU3MPHYWNA6GWH", "8EFC3KPEUXF8YXFB7CKSGIICA2KRACD67W", "C5X74HZZR164IDTN4HCZMN7Z76RCYYCHGD"];
const CONTRACT = "0x3B50dE27506f0a8C1f4122A1e6F470009a76ce2A".toLowerCase();
let keyIndex = 0;

function getApiKey() {
    const key = API_KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % API_KEYS.length;
    return key;
}

// 核心修复：绝对精准的连续签到算法 (23:00 刷新版)
function calculateStreak(txs) {
    if (!txs || txs.length === 0) return 0;
    const signedDays = new Set();
    
    txs.forEach(tx => {
        if (tx.isError === "0" && tx.to.toLowerCase() === CONTRACT) {
            const ts = parseInt(tx.timeStamp);
            // 加上 9 小时，让每天的 23:00 完美对齐系统的午夜 00:00 分割线
            const dateStr = new Date((ts + 9 * 3600) * 1000).toISOString().split('T')[0];
            signedDays.add(dateStr);
        }
    });
    
    if (signedDays.size === 0) return 0;
    
    const nowTs = Math.floor(Date.now() / 1000);
    const todayStr = new Date((nowTs + 9 * 3600) * 1000).toISOString().split('T')[0];
    const yesterdayStr = new Date((nowTs + 9 * 3600 - 86400) * 1000).toISOString().split('T')[0];
    
    let checkDate = signedDays.has(todayStr) ? todayStr : (signedDays.has(yesterdayStr) ? yesterdayStr : null);
    if (!checkDate) return 0;
    
    let streak = 0;
    let currentIterDate = new Date(checkDate + "T00:00:00Z"); 
    
    while (true) {
        const dateKey = currentIterDate.toISOString().split('T')[0];
        if (signedDays.has(dateKey)) {
            streak++;
            currentIterDate.setUTCDate(currentIterDate.getUTCDate() - 1); 
        } else { 
            break; 
        }
    }
    return streak;
}

async function start() {
    const addresses = JSON.parse(fs.readFileSync('./user.json', 'utf8'));
    const results = [];
    console.log(`🚀 开启【高保真稳妥】模式：总计扫描 ${addresses.length} 个地址...`);

    let completed = 0;
    const poolLimit = 5; 
    const executing = new Set();

    for (const addr of addresses) {
        const task = (async () => {
            let streak = -1;
            let retries = 10; 
            while (streak === -1 && retries > 0) {
                try {
                    const url = `https://api.etherscan.io/v2/api?chainid=2741&module=account&action=txlist&address=${addr}&sort=desc&apikey=${getApiKey()}`;
                    const resp = await axiosInstance.get(url);
                    if (resp.data.status === "1") streak = calculateStreak(resp.data.result);
                    else if (resp.data.message === "No transactions found") streak = 0;
                    else throw new Error("Limit");
                } catch (e) {
                    retries--;
                    if (retries > 0) {
                        const waitTime = (11 - retries) * 2000; 
                        await new Promise(r => setTimeout(r, waitTime)); 
                    } else {
                        streak = 0; 
                        console.log(`⚠️ 极度拥堵，放弃地址: ${addr}`);
                    }
                }
            }
            results.push({ address: addr, streak });
            completed++;
            if (completed % 100 === 0) console.log(`⚡ 进度: ${completed} / ${addresses.length} (${(completed/addresses.length*100).toFixed(1)}%)`);
        })();
        
        executing.add(task);
        task.finally(() => executing.delete(task));

        if (executing.size >= poolLimit) {
            await Promise.race(executing);
        }
        
        await new Promise(r => setTimeout(r, 150)); 
    }

    await Promise.all(executing);
    
    // 1. 保存所有用户的排名数据
    fs.writeFileSync('./results.json', JSON.stringify(results, null, 2));

    // ==========================================
    // 2. 统计并保存每天的趋势数据到 history.json
    // ==========================================
    const over7Count = results.filter(r => r.streak >= 7).length;
    // 获取北京时间的今天日期 (YYYY-MM-DD)
    const dateStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().split('T')[0];

    let history = [];
    if (fs.existsSync('./history.json')) {
        try {
            history = JSON.parse(fs.readFileSync('./history.json', 'utf8'));
        } catch(e) { console.log("history 读取失败，重新创建"); }
    }

    // 检查今天是否已经记录过，有则更新，无则新增
    const todayIndex = history.findIndex(h => h.date === dateStr);
    if (todayIndex > -1) {
        history[todayIndex] = { date: dateStr, count: over7Count };
    } else {
        history.push({ date: dateStr, count: over7Count });
    }

    // 只保留最近 30 天的数据
    if (history.length > 30) history = history.slice(-30);

    fs.writeFileSync('./history.json', JSON.stringify(history, null, 2));
    
    console.log("🎉 高保真扫描全部完成！已生成 results.json 和 history.json！");
}

start();
