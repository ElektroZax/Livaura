const Message = require('../models/Message');
const Activity = require('../models/Activity');

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('A user connected');

        socket.on('disconnect', () => {
            console.log('User disconnected');
        });

        socket.on('joinRoom', (roomId) => {
            socket.join(roomId);
            console.log(`User joined room: ${roomId}`);
        });

        socket.on('chatMessage', async (msg) => {
            try {
                // Save the message to the database
                const savedMessage = await Message.create({
                    room: msg.room,
                    user: msg.user,
                    userName: msg.userName,
                    text: msg.text,
                    color: msg.color
                });

                // Log the activity (only short message for the feed)
                await Activity.create({
                    description: `${msg.userName} sent a message: ${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}`,
                    user: msg.user,
                    room: msg.room,
                    type: 'chat',
                });
                
                // Broadcast the message to the chat container
                io.to(msg.room).emit('chatMessage', savedMessage);

                // Broadcast activity notification to all users in the room
                io.to(msg.room).emit('activityNotification', {
                    description: `${msg.userName} sent a message.`,
                    type: 'chat',
                    userName: msg.userName,
                    timestamp: new Date()
                });

            } catch (error) {
                console.error('Error saving or broadcasting message:', error);
            }
        });
    });
};