require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const prisma = require('./src/database/prisma');
const { setupBot } = require('./src/bot/commands');

const app = express();
const port = process.env.PORT || 3000;
const bot = new Telegraf(process.env.BOT_TOKEN);

// Setup bot handlers
setupBot(bot);

// Webhook setup
const webhookPath = `/telegraf/${bot.secretPathComponent()}`;
if (process.env.NODE_ENV === 'production') {
    app.use(bot.webhookCallback(webhookPath));
    bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}${webhookPath}`)
        .then(() => console.log('Webhook set successfully'))
        .catch(console.error);
} else {
    // For local development, you might want to use bot.launch() or ngrok
    console.log('Running in development mode. Use npm run dev for long polling if needed.');
    bot.launch();
}

app.use(express.json());

// Main health check
app.get('/', (req, res) => res.send('Game Bot is running!'));

// Graceful shutdown
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    process.exit(0);
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    process.exit(0);
});

// Timeout Background Job (Check every minute)
cron.schedule('* * * * *', async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const inactiveRooms = await prisma.room.findMany({
        where: {
            state: { notIn: ['FINISHED'] },
            last_action_at: { lt: fiveMinutesAgo }
        },
        include: {
            player1: true,
            player2: true
        }
    });

    for (const room of inactiveRooms) {
        console.log(`Expiring room ${room.id} due to inactivity.`);

        await prisma.$transaction([
            prisma.room.update({
                where: { id: room.id },
                data: { state: 'FINISHED' }
            }),
            prisma.user.updateMany({
                where: { current_room_id: room.id },
                data: { current_room_id: null }
            })
        ]);

        const msg = 'Permainan berakhir otomatis karena tidak ada aktifitas selama 5 menit.';
        bot.telegram.sendMessage(Number(room.player1.telegram_id), msg).catch(() => { });
        bot.telegram.sendMessage(Number(room.player2.telegram_id), msg).catch(() => { });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
