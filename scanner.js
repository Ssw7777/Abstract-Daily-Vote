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
        if (signedDays.has(dateKey)) { streak++; currentIterDate.setDate(currentIterDate.getDate() - 1); }
        else { break; }
    }
    return streak;
}

async function start() {
    const addresses = JSON.parse(fs.readFileSync('./user.json', 'utf8'));
    const results = [];
    console.log(`🚀 开启【无阻塞流水线】模式：总计扫描 ${addresses.length} 个地址...`);

    let completed = 0;
    const poolLimit = 12; // 传送带上最多同时保持 12 个请求
    const executing = new Set();

    for (const addr of addresses) {
        // 创建一个独立任务
        const task = (async () => {
            let streak = -1;
            let retries = 4;
            while (streak === -1 && retries > 0) {
                try {
                    const url = `https://api.etherscan.io/v2/api?chainid=2741&module=account&action=txlist&address=${addr}&sort=desc&apikey=${getApiKey()}`;
                    const resp = await axiosInstance.get(url);
                    if (resp.data.status === "1") streak = calculateStreak(resp.data.result);
                    else if (resp.data.message === "No transactions found") streak = 0;
                    else throw new Error("Limit");
                } catch (e) {
                    retries--;
                    if (retries > 0) await new Promise(r => setTimeout(r, 1500)); // 遇到限制，自己去罚站1.5秒，不影响别人
                    else streak = 0;
                }
            }
            results.push({ address: addr, streak });
            completed++;
            if (completed % 100 === 0) console.log(`⚡ 进度: ${completed} / ${addresses.length} (${(completed/addresses.length*100).toFixed(1)}%)`);
        })();
        
        executing.add(task);
        task.finally(() => executing.delete(task));

        // 如果传送带满了，等最快的一个完成再放新的上去
        if (executing.size >= poolLimit) {
            await Promise.race(executing);
        }
        
        // 发球间隔，避免瞬间挤爆
        await new Promise(r => setTimeout(r, 60)); 
    }

    // 等待最后剩下的任务全部跑完
    await Promise.all(executing);
    fs.writeFileSync('./results.json', JSON.stringify(results, null, 2));
    console.log("🎉 无阻塞扫描全部完成！已生成 results.json");
}

start();
