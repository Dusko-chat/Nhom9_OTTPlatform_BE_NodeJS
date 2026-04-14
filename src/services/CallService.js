const activeCalls = new Map(); // conversationId -> { participants: Set(userIds), startTime: Date }

const joinCall = (conversationId, userId) => {
    if (!activeCalls.has(conversationId)) {
        activeCalls.set(conversationId, { 
            participants: new Set(),
            startTime: new Date()
        });
    }
    activeCalls.get(conversationId).participants.add(userId);
    return Array.from(activeCalls.get(conversationId).participants);
};

const leaveCall = (conversationId, userId) => {
    let callData = null;
    if (activeCalls.has(conversationId)) {
        const data = activeCalls.get(conversationId);
        data.participants.delete(userId);
        if (data.participants.size === 0) {
            callData = { ...data, participants: [] };
            activeCalls.delete(conversationId);
        } else {
            callData = { ...data, participants: Array.from(data.participants) };
        }
    }
    return callData;
};

const getParticipants = (conversationId) => {
    return activeCalls.has(conversationId) ? Array.from(activeCalls.get(conversationId).participants) : [];
};

module.exports = { joinCall, leaveCall, getParticipants };
