// 配置项（调整MESSAGE_LIMIT为5）
const TELEGRAM_BOT_TOKEN = "8518301708:AAGQH_gLH5ogdWFQ_O7ZOZqckU92NknXhzE";
const CHANNEL_ID = "-1003455730162";
const MESSAGE_LIMIT = 5; // 仅保留最新5条消息
const WORKER_PROXY_DOMAIN = "https://tg-api.8899188.xyz"; // 修正为实际Worker域名

// DOM元素
const loadingEl = document.getElementById("loading");
const channelContentEl = document.getElementById("channel-content");
const errorEl = document.getElementById("error");
const updateTimeEl = document.getElementById("update-time");

// 格式化时间
function formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

// 封装带超时的fetch（优化点）
const fetchWithTimeout = (url, options = {}, timeout = 5000) => {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时')), timeout))
    ]);
};

// 封装代理请求函数（统一处理Telegram API代理）
async function proxyFetchTelegramApi(apiPath) {
    const fullApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${apiPath}`;
    const proxyUrl = `${WORKER_PROXY_DOMAIN}/?url=${encodeURIComponent(fullApiUrl)}`;
    
    const response = await fetchWithTimeout(proxyUrl); // 使用超时fetch
    if (!response.ok) {
        throw new Error(`代理请求失败：${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.ok) {
        throw new Error(`API错误：${data.description || "无法获取数据"}`);
    }
    return data;
}

// 拉取Telegram频道消息
async function fetchChannelMessages() {
    try {
        loadingEl.classList.remove("hidden");
        errorEl.classList.add("hidden");

        // 1. 通过Worker代理请求getUpdates接口（补充allowed_updates参数）
        const apiParams = `getUpdates?offset=-${MESSAGE_LIMIT}&limit=${MESSAGE_LIMIT}&allowed_updates=["channel_post"]`;
        const data = await proxyFetchTelegramApi(apiParams);

        // 过滤频道消息并限制为5条
        const updates = data.result || [];
        const channelMessages = updates
            .filter(update => 
                update.channel_post && 
                update.channel_post.chat && 
                update.channel_post.chat.id.toString() === CHANNEL_ID
            )
            .map(update => update.channel_post)
            .reverse()
            .slice(0, MESSAGE_LIMIT); // 确保只取5条

        if (channelMessages.length === 0) {
            channelContentEl.innerHTML = `<div class="text-center py-10 text-gray-500">
                <i class="fa fa-inbox text-3xl mb-3"></i>
                <p>频道暂无消息</p>
            </div>`;
            return;
        }

        // 生成消息内容
        let contentHtml = "";
        for (const message of channelMessages) {
            const messageTime = formatTime(message.date);
            const messageText = message.text || "";
            let messageContent = "";

            // 2. 处理图片（通过Worker代理请求，增加超时）
            if (message.photo && message.photo.length > 0) {
                try {
                    const fileId = message.photo[message.photo.length - 1].file_id;
                    // 代理请求getFile接口
                    const fileData = await proxyFetchTelegramApi(`getFile?file_id=${fileId}`);
                    const photoPath = fileData.result.file_path;
                    // 代理访问图片文件
                    const photoProxyUrl = `${WORKER_PROXY_DOMAIN}/?url=${encodeURIComponent(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${photoPath}`)}`;
                    messageContent += `<img src="${photoProxyUrl}" class="w-full max-w-full rounded-md mb-3" alt="频道图片" onError="this.style.display='none'">`;
                } catch (e) {
                    console.warn("图片加载失败：", e);
                }
            }

            // 处理文字
            if (messageText) {
                messageContent += `<div class="text-gray-800 text-lg">${messageText.replace(/\n/g, "<br>")}</div>`;
            }

            contentHtml += `
                <div class="bg-white rounded-lg shadow-sm p-5 border border-gray-100">
                    <div class="text-gray-400 text-sm mb-2">${messageTime}</div>
                    ${messageContent || "<div class='text-gray-500'>（无内容）</div>"}
                </div>
            `;
        }

        channelContentEl.innerHTML = contentHtml;
        updateTimeEl.textContent = `最后更新：${formatTime(Date.now() / 1000)}`;

    } catch (err) {
        console.error("错误详情：", err);
        errorEl.innerHTML = `<p class="flex items-center">
            <i class="fa fa-exclamation-circle mr-2"></i>
            加载失败：${err.message}
        </p>`;
        errorEl.classList.remove("hidden");
    } finally {
        loadingEl.classList.add("hidden");
        channelContentEl.classList.remove("hidden");
    }
}

// 页面加载后执行（仅首次加载时拉取一次）
window.onload = fetchChannelMessages;