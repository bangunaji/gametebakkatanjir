const redis = require('../utils/redis');

/**
 * Validates the room state for specific commands.
 */
function validateState(requiredStates) {
    return async (ctx, next) => {
        const user = ctx.state.dbUser;
        if (!user.current_room_id) {
            if (requiredStates.includes('NONE')) return next();
            return ctx.reply('Kamu tidak sedang berada di dalam room.');
        }

        const { roomService } = require('../services/roomService'); // Lazy require
        const room = await require('../database/prisma').room.findUnique({
            where: { id: user.current_room_id },
            include: { player1: true, player2: true }
        });

        if (!room) {
            // Cleanup orphaned room id
            await require('../database/prisma').user.update({
                where: { id: user.id },
                data: { current_room_id: null }
            });
            if (requiredStates.includes('NONE')) return next();
            return ctx.reply('Room tidak ditemukan.');
        }

        if (!requiredStates.includes(room.state)) {
            return ctx.reply(`Command ini tidak valid dalam state ${room.state}.`);
        }

        ctx.state.room = room;
        return next();
    };
}

/**
 * Rate limiting for specific commands (especially /jawab)
 */
async function rateLimit(ctx, next) {
    if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/jawab')) {
        const userId = ctx.from.id;
        const key = `rate_limit:jawab:${userId}`;
        const exists = await redis.get(key);

        if (exists) {
            return ctx.reply('Spam terdeteksi! Tunggu 2 detik sebelum menjawab lagi.');
        }

        await redis.set(key, '1', 'EX', 2);
    }
    return next();
}

/**
 * Injects DB user into ctx.state
 */
async function attachUser(ctx, next) {
    if (!ctx.from) return next();
    const { getOrCreateUser } = require('../services/roomService');
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    ctx.state.dbUser = user;
    return next();
}

module.exports = { validateState, rateLimit, attachUser };
