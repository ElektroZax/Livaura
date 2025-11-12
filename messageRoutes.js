const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Message = require('../models/Message');
const Room = require('../models/Room');
const Activity = require('../models/Activity');

// Middleware to get user's room and attach to request
const getUserRoom = async (req, res, next) => {
    try {
        const room = await Room.findOne({ members: req.user._id });
        if (!room) {
            return res.status(404).json({ message: 'You are not in a room.' });
        }
        req.room = room;
        next();
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get all message history for a room
// @route   GET /api/messages/history/:roomId
// @access  Private
router.get('/history/:roomId', protect, async (req, res) => {
    try {
        const messages = await Message.find({ room: req.params.roomId })
            .sort({ createdAt: 'asc' });
        res.json(messages);
    } catch (error) {
        console.error('Error fetching message history:', error);
        res.status(500).json({ message: 'Error fetching message history.' });
    }
});

// @desc    Clear all messages for the user's room (owner only)
// @route   DELETE /api/messages/clear
// @access  Private (Owner only)
router.delete('/clear', protect, getUserRoom, async (req, res) => {
    try {
        const room = await Room.findOne({ _id: req.room._id });
        if (!room) {
            return res.status(404).json({ message: 'Room not found.' });
        }
        if (room.createdBy.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized to clear this chat.' });
        }
        
        await Message.deleteMany({ room: req.room._id });

        // Log the activity
        await Activity.create({
            description: `${req.user.name} cleared the chat.`,
            user: req.user._id,
            room: req.room._id,
            type: 'chat',
        });

        // Send a real-time message to the chat that it has been cleared
        if (io) {
            io.to(req.room._id).emit('chatMessage', {
                userName: 'System',
                text: 'The chat has been cleared by the room owner.',
                color: '#808080'
            });
        }
        

        res.json({ message: 'Chat cleared successfully.' });
    } catch (error) {
        console.error('Error clearing chat:', error);
        res.status(500).json({ message: 'Error clearing chat.' });
    }
});

module.exports = (io) => {
    return router;
};