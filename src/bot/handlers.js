const { Markup } = require('telegraf');
const roomService = require('../services/roomService');
const gameService = require('../services/gameService');

async function startHandler(ctx) {
    const user = ctx.state.dbUser;
    if (user.current_room_id) {
        return ctx.reply('Kamu sudah berada dalam sebuah room. Gunakan /keluar jika ingin keluar.');
    }
    return ctx.reply('Selamat datang di Tebak Kata Bot! Gunakan /cari @username untuk menantang temanmu.');
}

async function cariHandler(ctx) {
    const user = ctx.state.dbUser;
    const match = ctx.message.text.split(' ');
    if (match.length < 2) return ctx.reply('Format: /cari @username');

    const targetUsername = match[1];
    const targetUser = await roomService.findUserByUsername(targetUsername);

    if (!targetUser) return ctx.reply('User tidak ditemukan atau belum pernah menggunakan bot ini.');
    if (targetUser.id === user.id) return ctx.reply('Kamu tidak bisa menantang dirimu sendiri.');
    if (targetUser.current_room_id) return ctx.reply('Target sedang berada dalam room lain.');

    // Create invitation
    return ctx.telegram.sendMessage(Number(targetUser.telegram_id), `Pemain @${user.username} menantangmu bermain tebak kata!`, Markup.inlineKeyboard([
        [Markup.button.callback('Terima', `accept_${user.id}`), Markup.button.callback('Tolak', `reject_${user.id}`)]
    ]));
}

async function callbackHandler(ctx) {
    const data = ctx.callbackQuery.data;
    const user = ctx.state.dbUser;

    if (data.startsWith('accept_')) {
        const challengerId = parseInt(data.split('_')[1]);
        const challenger = await require('../database/prisma').user.findUnique({ where: { id: challengerId } });

        if (!challenger || challenger.current_room_id) {
            return ctx.answerCbQuery('Penantang sudah berada dalam room lain.');
        }

        const room = await roomService.createRoom(challenger.id, user.id);
        await ctx.answerCbQuery('Permainan diterima!');
        await ctx.editMessageText('Permainan dimulai! Gunakan /mulai untuk memulai.');
        return ctx.telegram.sendMessage(Number(challenger.telegram_id), `@${user.username} menerima tantanganmu! Gunakan /mulai untuk memulai.`);
    }

    if (data.startsWith('reject_')) {
        const challengerId = parseInt(data.split('_')[1]);
        const challenger = await require('../database/prisma').user.findUnique({ where: { id: challengerId } });
        await ctx.answerCbQuery('Permainan ditolak.');
        await ctx.editMessageText('Kamu menolak tantangan.');
        if (challenger) {
            return ctx.telegram.sendMessage(Number(challenger.telegram_id), `@${user.username} menolak tantanganmu.`);
        }
    }
}

async function mulaiHandler(ctx) {
    const room = ctx.state.room;
    const user = ctx.state.dbUser;
    const updatedRoom = await gameService.setStartConfirm(room.id, user.id);

    if (updatedRoom.state === 'INPUT_SECRET') {
        const p1Id = Number(updatedRoom.player1.telegram_id);
        const p2Id = Number(updatedRoom.player2.telegram_id);
        ctx.telegram.sendMessage(p1Id, 'Kalian berdua sudah siap! Silakan kirim kata/kalimat rahasia dengan /simpankata <kata>');
        ctx.telegram.sendMessage(p2Id, 'Kalian berdua sudah siap! Silakan kirim kata/kalimat rahasia dengan /simpankata <kata>');
    } else {
        ctx.reply('Menunggu pemain lain untuk /mulai...');
    }
}

async function simpanKataHandler(ctx) {
    const room = ctx.state.room;
    const user = ctx.state.dbUser;
    const match = ctx.message.text.split(' ');
    if (match.length < 2) return ctx.reply('Format: /simpankata <katamu>');

    const word = match.slice(1).join(' ');
    if (word.length < 3 || word.length > 100) return ctx.reply('Kata harus antara 3 - 100 karakter.');

    await gameService.setWord(room.id, user.id, word);
    return ctx.reply('Kata rahasia tersimpan! Gunakan /selesaisimpan jika sudah yakin.');
}

async function selesaiSimpanHandler(ctx) {
    const room = ctx.state.room;
    const user = ctx.state.dbUser;
    const updatedRoom = await gameService.setReady(room.id, user.id);

    if (updatedRoom.state === 'READY_CHECK') {
        const p1Id = Number(updatedRoom.player1.telegram_id);
        const p2Id = Number(updatedRoom.player2.telegram_id);
        ctx.telegram.sendMessage(p1Id, 'Kedua pemain sudah menyimpan kata! Gunakan /siap untuk memulai permainan.');
        ctx.telegram.sendMessage(p2Id, 'Kedua pemain sudah menyimpan kata! Gunakan /siap untuk memulai permainan.');
    } else {
        ctx.reply('Menunggu lawan selesai menyimpan kata...');
    }
}

async function siapHandler(ctx) {
    const room = ctx.state.room;
    const user = ctx.state.dbUser;
    const updatedRoom = await gameService.setReady(room.id, user.id);

    if (updatedRoom.state === 'PLAYING') {
        const turnUser = updatedRoom.turn_player_id === updatedRoom.player1_id ? updatedRoom.player1 : updatedRoom.player2;
        const p1Id = Number(updatedRoom.player1.telegram_id);
        const p2Id = Number(updatedRoom.player2.telegram_id);
        const msg = `Permainan dimulai! Giliran @${turnUser.username} untuk menebak kata lawan. Gunakan /jawab <jawaban>`;
        ctx.telegram.sendMessage(p1Id, msg);
        ctx.telegram.sendMessage(p2Id, msg);
    } else {
        ctx.reply('Menunggu lawan untuk /siap...');
    }
}

async function jawabHandler(ctx) {
    const room = ctx.state.room;
    const user = ctx.state.dbUser;
    const match = ctx.message.text.split(' ');
    if (match.length < 2) return ctx.reply('Format: /jawab <tebakanmu>');

    const answer = match.slice(1).join(' ');
    try {
        const result = await gameService.processAnswer(room.id, user.id, answer);
        const p1Id = Number(result.room.player1.telegram_id);
        const p2Id = Number(result.room.player2.telegram_id);

        if (result.correct) {
            const msg = `🎉 @${user.username} BENAR! Katanya adalah "${answer}". @${user.username} Menang!\nSkor: @${result.room.player1.username}: ${result.room.player1_score} | @${result.room.player2.username}: ${result.room.player2_score}\n\nKetik /mulai jika ingin bermain kembali di room ini, atau ketik chat bebas untuk mengobrol. Ketik /keluar untuk mengakhiri.`;
            ctx.telegram.sendMessage(p1Id, msg);
            ctx.telegram.sendMessage(p2Id, msg);
        } else {
            const nextTurnId = result.room.turn_player_id === result.room.player1_id ? result.room.player1.telegram_id : result.room.player2.telegram_id;
            const nextTurnUser = result.room.turn_player_id === result.room.player1_id ? result.room.player1.username : result.room.player2.username;

            ctx.reply('Jawaban salah! Giliran berpindah.');
            ctx.telegram.sendMessage(Number(nextTurnId), `Lawan salah menebak! Sekarang giliranmu, @${nextTurnUser}.`);
        }
    } catch (err) {
        ctx.reply(err.message);
    }
}

async function keluarHandler(ctx) {
    const user = ctx.state.dbUser;
    if (!user.current_room_id) return ctx.reply('Kamu tidak sedang dalam room.');

    await roomService.leaveRoom(user.id, user.current_room_id);
    return ctx.reply('Kamu keluar dari room. Lawan otomatis menang.');
}

async function textHandler(ctx) {
    const user = ctx.state.dbUser;
    const room = ctx.state.room;

    if (room && (room.state === 'PLAYING' || room.state === 'FINISHED')) {
        const opponentId = room.player1_id === user.id ? room.player2.telegram_id : room.player1.telegram_id;
        ctx.telegram.sendMessage(Number(opponentId), `💬 @${user.username}: ${ctx.message.text}`);
    }
}

module.exports = {
    startHandler,
    cariHandler,
    callbackHandler,
    mulaiHandler,
    simpanKataHandler,
    selesaiSimpanHandler,
    siapHandler,
    jawabHandler,
    keluarHandler,
    textHandler,
};
