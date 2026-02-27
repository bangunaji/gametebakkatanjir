const prisma = require('../database/prisma');
const crypto = require('crypto');
const { normalizeString } = require('../utils/stringNormalizer');

async function setWord(roomId, userId, word) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new Error('Room not found');

    const updateData = {};
    if (room.player1_id === userId) {
        updateData.player1_word = word;
    } else {
        updateData.player2_word = word;
    }

    return await prisma.room.update({
        where: { id: roomId },
        data: { ...updateData, last_action_at: new Date() },
    });
}

async function setReady(roomId, userId) {
    return await prisma.$transaction(async (tx) => {
        const room = await tx.room.findUnique({
            where: { id: roomId },
            lock: { mode: 'update' },
        });

        const isP1 = room.player1_id === userId;
        const updateData = isP1 ? { player1_ready: true } : { player2_ready: true };

        const updatedRoom = await tx.room.update({
            where: { id: roomId },
            data: { ...updateData, last_action_at: new Date() },
        });

        // Check if both are ready to transition state
        if (updatedRoom.player1_ready && updatedRoom.player2_ready) {
            if (updatedRoom.state === 'INPUT_SECRET') {
                return await tx.room.update({
                    where: { id: roomId },
                    data: { state: 'READY_CHECK' },
                });
            } else if (updatedRoom.state === 'READY_CHECK') {
                const turnPlayerId = crypto.randomInt(0, 2) === 0 ? updatedRoom.player1_id : updatedRoom.player2_id;
                return await tx.room.update({
                    where: { id: roomId },
                    data: {
                        state: 'PLAYING',
                        turn_player_id: turnPlayerId,
                    },
                });
            }
        }
        return updatedRoom;
    });
}

async function setStartConfirm(roomId, userId) {
    return await prisma.$transaction(async (tx) => {
        const room = await tx.room.findUnique({
            where: { id: roomId },
            lock: { mode: 'update' },
        });

        const isP1 = room.player1_id === userId;
        const updateData = isP1 ? { player1_start_confirm: true } : { player2_start_confirm: true };

        const updatedRoom = await tx.room.update({
            where: { id: roomId },
            data: { ...updateData, last_action_at: new Date() },
        });

        if (updatedRoom.player1_start_confirm && updatedRoom.player2_start_confirm) {
            return await tx.room.update({
                where: { id: roomId },
                data: { state: 'INPUT_SECRET' },
            });
        }
        return updatedRoom;
    });
}

async function processAnswer(roomId, userId, answer) {
    return await prisma.$transaction(async (tx) => {
        const room = await tx.room.findUnique({
            where: { id: roomId },
            lock: { mode: 'update' },
        });

        if (room.state !== 'PLAYING') throw new Error('Game is not in playing state');
        if (room.turn_player_id !== userId) throw new Error('Not your turn');

        const normalizedAnswer = normalizeString(answer);
        const opponentId = room.player1_id === userId ? room.player2_id : room.player1_id;
        const opponentWord = room.player1_id === userId ? room.player2_word : room.player1_word;
        const normalizedOpponentWord = normalizeString(opponentWord);

        if (normalizedAnswer === normalizedOpponentWord) {
            // Correct answer
            const updatedRoom = await tx.room.update({
                where: { id: roomId },
                data: {
                    state: 'FINISHED',
                    winner_id: userId,
                    [room.player1_id === userId ? 'player1_score' : 'player2_score']: { increment: 1 },
                    last_action_at: new Date(),
                },
            });

            // Clear current_room_id for both players
            await tx.user.updateMany({
                where: { current_room_id: roomId },
                data: { current_room_id: null },
            });

            return { correct: true, room: updatedRoom };
        } else {
            // Wrong answer, switch turn
            const updatedRoom = await tx.room.update({
                where: { id: roomId },
                data: {
                    turn_player_id: opponentId,
                    last_action_at: new Date(),
                },
            });
            return { correct: false, room: updatedRoom };
        }
    });
}

module.exports = {
    setWord,
    setReady,
    setStartConfirm,
    processAnswer,
};
