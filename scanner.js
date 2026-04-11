const fs = require('fs');
const axios = require('axios');

 配置信息
const API_KEYS = ["BNQ1DZYHBGF5V8J88C7XZU3MPHYWNA6GWH", "8EFC3KPEUXF8YXFB7CKSGIICA2KRACD67W", "C5X74HZZR164IDTN4HCZMN7Z76RCYYCHGD"];
const CONTRACT = 0x3B50dE27506f0a8C1f4122A1e6F470009a76ce2A.toLowerCase();
let keyIndex = 0;

function getApiKey() {
    const key = API_KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % API_KEYS.length;
    return key;
}

 连续签到计算逻辑
function calculateStreak(txs) {
    if (!txs  txs.length === 0) return 0;
    const signedDays = new Set();
    txs.forEach(tx = {
        if (tx.isError === 0 && tx.to.toLowerCase() === CONTRACT) {
            const ts = parseInt(tx.timeStamp);
            const dateStr = new Date((ts - 23  3600)  1000).toISOString().split('T')[0];
            signedDays.add(dateStr);
        }
    });
    if (signedDays.size === 0) return 0;
    const nowTs = Math.floor(Date.now()  1000);
    const todayStr = new Date((nowTs - 23  3600)  1000).toISOString().split('T')[0];
    const yesterdayStr = new Date((nowTs - 23  3600 - 86400)  1000).toISOString().split('T')[0];
    let checkDate = signedDays.has(todayStr)  todayStr  (signedDays.has(yesterdayStr)  yesterdayStr  null);
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
    const addresses = JSON.parse(fs.readFileSync('.user.json', 'utf8'));
    const results = [];
    console.log(`开始处理 ${addresses.length} 个地址...`);

    for (let addr of addresses) {
        try {
            const resp = await axios.get(`httpsapi.etherscan.iov2apichainid=2741&module=account&action=txlist&address=${addr}&sort=desc&apikey=${getApiKey()}`);
            const streak = resp.data.status === 1  calculateStreak(resp.data.result)  0;
            results.push({ address addr, streak });
            console.log(`${addr} ${streak} 天`);
            await new Promise(r = setTimeout(r, 250));  控制频率
        } catch (e) {
            results.push({ address addr, streak 0 });
        }
    }

     将结果写入文件
    fs.writeFileSync('.results.json', JSON.stringify(results, null, 2));
    console.log(数据更新完成！);
}

start();
