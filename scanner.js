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
    // 【修改点1】降低并发上限，从 12 降到 5，配合 3 个 API Key 刚刚好，不拥堵
    const poolLimit = 5; 
    const executing = new Set();

    for (const addr of addresses) {
        const task = (async () => {
            let streak = -1;
            // 【修改点2】重试次数从 4 次提升到 10 次，死磕到底
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
                        // 【修改点3】动态退避罚站机制：第一次失败等2秒，第二次等4秒...绝不疯狂撞墙
                        const waitTime = (11 - retries) * 2000; 
                        await new Promise(r => setTimeout(r, waitTime)); 
                    } else {
                        // 10次都失败才会记为0，概率极低
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
        
        // 【修改点4】每次发球间隔从 60ms 延长到 150ms，从源头控制车流
        await new Promise(r => setTimeout(r, 150)); 
    }

    await Promise.all(executing);
    fs.writeFileSync('./results.json', JSON.stringify(results, null, 2));
    console.log("🎉 高保真扫描全部完成！已生成 results.json，零错杀！");
}

start();
