const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const JoinRequest = require('../models/JoinRequest');
const Room = require('../models/Room');
const Activity = require('../models/Activity');
const User = require('../models/User');

// Utility function to log and emit
const logAndEmit = async (io, room, user, description, type) => {
    // 1. Log to DB
    await Activity.create({ description, user: user._id, room: room._id, type });
    
    // 2. Emit Real-time notification
    io.to(room._id.toString()).emit('activityNotification', {
        description: description,
        type: type,
        userName: user.name,
        timestamp: new Date()
    });
};
// GET /api/requests - Fetch incoming requests for the room owner
router.get('/', protect, async (req, res) => {
    try {
        const room = await Room.findOne({ createdBy: req.user._id });
        if (!room) {
            return res.json([]); // Not an owner, so no requests to show
        }
        const requests = await JoinRequest.find({ room: room._id, status: 'pending' }).populate('user', 'name email');
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// GET /api/requests/outgoing - Fetch requests sent by the current user
router.get('/outgoing', protect, async (req, res) => {
    try {
        const requests = await JoinRequest.find({ user: req.user._id }).populate('room', 'name');
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST /api/requests/send - Send a request to a specific room
router.post('/send', protect, async (req, res) => {
    const { roomId, message } = req.body;
    try {
        const existingRequest = await JoinRequest.findOne({ room: roomId, user: req.user._id });
        if (existingRequest) {
            return res.status(400).json({ message: 'You have already sent a request to this room.' });
        }
        await JoinRequest.create({ room: roomId, user: req.user._id, message });
        res.status(201).json({ message: 'Request sent successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST /api/requests/send-by-code - Send a request using a join code
router.post('/send-by-code', protect, async (req, res) => {
    const { joinCode, message } = req.body;
    try {
        const room = await Room.findOne({ joinCode });
        if (!room) {
            return res.status(404).json({ message: 'Room not found with that code.' });
        }
        const existingRequest = await JoinRequest.findOne({ room: room._id, user: req.user._id });
        if (existingRequest) {
            return res.status(400).json({ message: 'You have already sent a request to this room.' });
        }
        await JoinRequest.create({ room: room._id, user: req.user._id, message });
        res.status(201).json({ message: 'Request sent successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/requests/:id/accept - Owner accepts a request
router.put('/:id/accept', protect, async (req, res) => {
    try {
        const request = await JoinRequest.findById(req.params.id).populate('room');
        if (!request || request.room.createdBy.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized.' });
        }
        const room = await Room.findById(request.room._id);
        if (room.members.length >= room.maxMembers) {
            return res.status(400).json({ message: 'Room is full.' });
        }
        room.members.push(request.user);
        await room.save();
        request.status = 'accepted';
        await request.save();
        
        const acceptedUser = await User.findById(request.user);

        // Log the activity and emit
        await logAndEmit(io, room, req.user, `${req.user.name} accepted ${acceptedUser.name}'s join request.`, 'join');
        
        res.json({ message: 'Request accepted.' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/requests/:id/decline - Owner declines a request
router.put('/:id/decline', protect, async (req, res) => {
    try {
        const request = await JoinRequest.findById(req.params.id).populate('room');
        if (!request || request.room.createdBy.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized.' });
        }
        request.status = 'declined';
        await request.save();
        res.json({ message: 'Request declined.' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = (io) => {
    return router;
};