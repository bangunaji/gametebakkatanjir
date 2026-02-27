const handlers = require('./handlers');
const { validateState, rateLimit, attachUser } = require('../middlewares/stateValidator');

function setupBot(bot) {
    // Global Middlewares
    bot.use(attachUser);
    bot.use(rateLimit);

    // Commands
    bot.command('start', handlers.startHandler);
    bot.command('cari', handlers.cariHandler);
    bot.command('mulai', validateState(['WAITING_START', 'FINISHED']), handlers.mulaiHandler);
    bot.command('simpankata', validateState(['INPUT_SECRET']), handlers.simpanKataHandler);
    bot.command('selesaisimpan', validateState(['INPUT_SECRET']), handlers.selesaiSimpanHandler);
    bot.command('siap', validateState(['READY_CHECK', 'INPUT_SECRET']), handlers.siapHandler);
    bot.command('jawab', validateState(['PLAYING']), handlers.jawabHandler);
    bot.command('keluar', handlers.keluarHandler);

    // Callbacks
    bot.on('callback_query', handlers.callbackHandler);

    // Text Relay
    bot.on('text', validateState(['PLAYING', 'FINISHED']), handlers.textHandler);

    // Set help/command list
    bot.telegram.setMyCommands([
        { command: 'start', description: 'Mulai bot' },
        { command: 'cari', description: 'Cari lawan (@username)' },
        { command: 'mulai', description: 'Konfirmasi mulai permainan' },
        { command: 'simpankata', description: 'Simpan kata rahasiamu' },
        { command: 'selesaisimpan', description: 'Selesai simpan kata' },
        { command: 'siap', description: 'Siap untuk bermain' },
        { command: 'jawab', description: 'Tebak kata lawan' },
        { command: 'keluar', description: 'Keluar dari room' },
    ]);
}

module.exports = { setupBot };
