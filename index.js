const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel],
});

const token = 'YOUR_DISCORD_BOT_TOKEN'; // Замените на ваш токен
const outputJsonFile = 'messages.json';
const outputTxtFile = 'statistics.txt';

// Массив ID каналов, которые нужно игнорировать
const ignoredChannelIds = [
    'CHANNEL_ID_1', // Замените на ID первого канала
    'CHANNEL_ID_2', // Замените на ID второго канала
];

const maxMessagesPerChannel = 0; // 0 = все сообщения, >0 = ограничение

let allMessages = [];
let userMessageCount = {};
let channelMessageCount = {};

// Функция для задержки
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const guild = client.guilds.cache.first();
    if (!guild) {
        console.log('Бот не подключен ни к одной гильдии.');
        client.destroy();
        return;
    }

    console.log(`Сканирование сервера: ${guild.name}`);

    await guild.members.fetch(); // Загружаем кэш участников

    const channels = guild.channels.cache.filter(
        (channel) => channel.isTextBased() && channel.permissionsFor(guild.members.me).has('ViewChannel')
    );

    if (channels.size === 0) {
        console.log('На сервере нет текстовых каналов, доступных для сканирования.');
        client.destroy();
        return;
    }

    for (const [channelId, channel] of channels) {
        // Проверяем, нужно ли игнорировать этот канал
        if (ignoredChannelIds.includes(channelId)) {
            console.log(`Канал ${channel.name} (ID: ${channelId}) пропущен.`);
            continue;
        }

        console.log(`Сканирование канала: ${channel.name}`);

        let lastMessageId = null;
        let messages = [];
        let messageCount = 0;

        do {
            const options = { limit: 100 };
            if (lastMessageId) {
                options.before = lastMessageId;
            }

            try {
                const fetchedMessages = await channel.messages.fetch(options);
                messages = messages.concat(Array.from(fetchedMessages.values()));
                lastMessageId = fetchedMessages.last()?.id;

                messageCount += fetchedMessages.size;
                console.log(`Загружено ${messageCount} сообщений из канала ${channel.name}`);

                // Если maxMessagesPerChannel > 0, прекращаем загрузку после достижения лимита
                if (maxMessagesPerChannel > 0 && messageCount >= maxMessagesPerChannel) {
                    console.log(`Достигнут лимит сообщений (${maxMessagesPerChannel}) для канала ${channel.name}.`);
                    break;
                }

                await delay(1000); // Задержка между запросами
            } catch (error) {
                if (error.code === 429) {
                    console.log('Превышен лимит запросов. Повторная попытка через 5 секунд...');
                    await delay(5000);
                    continue;
                } else {
                    console.error(`Ошибка при загрузке сообщений из канала ${channel.name}:`, error);
                    break;
                }
            }
        } while (lastMessageId);

        allMessages = allMessages.concat(messages);
        channelMessageCount[channel.name] = (channelMessageCount[channel.name] || 0) + messages.length;
    }

    fs.writeFileSync(outputJsonFile, JSON.stringify(allMessages, null, 2));
    console.log(`Все сообщения сохранены в ${outputJsonFile}`);

    allMessages.forEach((message) => {
        const username = message.author.username;
        userMessageCount[username] = (userMessageCount[username] || 0) + 1;
    });

    let statistics = '=== Статистика по пользователям ===\n';
    statistics += Object.entries(userMessageCount)
        .map(([username, count]) => `Пользователь ${username}: ${count} сообщений`)
        .join('\n');

    statistics += '\n\n=== Статистика по каналам ===\n';
    statistics += Object.entries(channelMessageCount)
        .map(([channelName, count]) => `Канал ${channelName}: ${count} сообщений`)
        .join('\n');

    fs.writeFileSync(outputTxtFile, statistics);
    console.log(`Статистика сохранена в ${outputTxtFile}`);

    client.destroy();
});

client.login(token);
