const prisma = require('../database/prisma');

async function getOrCreateUser(telegram_id, username) {
    return await prisma.user.upsert({
        where: { telegram_id: BigInt(telegram_id) },
        update: { username },
        create: {
            telegram_id: BigInt(telegram_id),
            username,
        },
    });
}

async function findUserByUsername(username) {
    // Remove '@' if present
    const cleanUsername = username.startsWith('@') ? username.slice(1) : username;
    return await prisma.user.findFirst({
        where: {
            username: {
                equals: cleanUsername,
                mode: 'insensitive',
            },
        },
    });
}

async function createRoom(player1_id, player2_id) {
    return await prisma.$transaction(async (tx) => {
        const room = await tx.room.create({
            data: {
                player1_id,
                player2_id,
                state: 'WAITING_START',
            },
        });

        await tx.user.updateMany({
            where: { id: { in: [player1_id, player2_id] } },
            data: { current_room_id: room.id },
        });

        return room;
    });
}

async function getRoomWithPlayers(roomId) {
    return await prisma.room.findUnique({
        where: { id: roomId },
        include: {
            player1: true,
            player2: true,
        },
    });
}

async function leaveRoom(userId, roomId) {
    return await prisma.$transaction(async (tx) => {
        const room = await tx.room.findUnique({
            where: { id: roomId },
        });

        if (!room || room.state === 'FINISHED') return;

        // Set winner as the other player
        const winnerId = room.player1_id === userId ? room.player2_id : room.player1_id;

        await tx.room.update({
            where: { id: roomId },
            data: {
                state: 'FINISHED',
                winner_id: winnerId,
            },
        });

        await tx.user.updateMany({
            where: { current_room_id: roomId },
            data: { current_room_id: null },
        });
    });
}

module.exports = {
    getOrCreateUser,
    findUserByUsername,
    createRoom,
    getRoomWithPlayers,
    leaveRoom,
};
