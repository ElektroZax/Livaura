const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Room = require('../models/Room');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const GroceryItem = require('../models/GroceryItem');
const CalendarEvent = require('../models/CalendarEvent');
const Message = require('../models/Message');
const JoinRequest = require('../models/JoinRequest');


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


module.exports = (io) => { // WRAPPED ROUTER IN FUNCTION TO ACCEPT IO

// Handles GET requests to /api/rooms
router.get('/', protect, async (req, res) => {
    try {
        const room = await Room.findOne({ members: req.user._id }).populate('members', 'name email');
        res.json(room);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

router.put('/togglelock', protect, async (req, res) => {
    try {
        const room = await Room.findOne({ createdBy: req.user._id });
        if (!room) {
            return res.status(401).json({ message: 'You are not the room owner.' });
        }

        room.isPublic = !room.isPublic;
        await room.save();

        const status = room.isPublic ? 'unlocked' : 'locked';

        // Log the activity and emit
        await logAndEmit(io, room, req.user, `${req.user.name} ${status} the room.`, 'lock');

        res.json({ message: `Room is now ${status}.` });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.delete('/delete', protect, async (req, res) => {
    try {
        const room = await Room.findOne({ createdBy: req.user._id });
        if (!room) {
            return res.status(401).json({ message: 'You are not the owner of any room.' });
        }

        const roomId = room._id;

        // Perform a cascading delete of all associated data
        await Expense.deleteMany({ room: roomId });
        await Settlement.deleteMany({ room: roomId });
        await GroceryItem.deleteMany({ room: roomId });
        await Activity.deleteMany({ room: roomId });
        await CalendarEvent.deleteMany({ room: roomId });
        await Message.deleteMany({ room: roomId });
        await JoinRequest.deleteMany({ room: roomId });

        // Finally, delete the room itself
        await Room.findByIdAndDelete(roomId);

        res.json({ message: 'Room and all associated data have been deleted successfully.' });

    } catch (error) {
        console.error('Error deleting room:', error);
        res.status(500).json({ message: 'Server Error while deleting the room.' });
    }
});

router.get('/public', async (req, res) => {
    const { location } = req.query;
    let query = { isPublic: true };

    if (location) {
        // Use a case-insensitive regular expression for searching
        query.location = { $regex: location, $options: 'i' }; 
    }

    try {
        const rooms = await Room.find(query).select('-joinCode').populate({
            path: 'members',
            select: 'name'
        });
        
        // Map the rooms to a new structure that includes memberCount
        const roomsWithCount = rooms.map(room => ({
            _id: room._id,
            name: room.name,
            description: room.description,
            location: room.location,
            maxMembers: room.maxMembers,
            memberCount: room.members.length,
        }));

        res.json(roomsWithCount);
    } catch (error) {
        // Log the full error on the server side for debugging
        console.error('Error fetching public rooms:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
});

// Handles POST requests to /api/rooms/create
router.post('/create', protect, async (req, res) => {
    const { name, description, location, contact, isPublic, maxMembers } = req.body;
    if (!name || !maxMembers || !location || !contact) {
        return res.status(400).json({ message: 'Please provide all required fields' });
    }

    try {
        const newRoom = new Room({
            name, description, location, contact, isPublic, maxMembers,
            createdBy: req.user._id,
            members: [req.user._id],
        });
        await newRoom.save();

        // Log the activity and emit
        await logAndEmit(io, newRoom, req.user, `${req.user.name} created the room.`, 'join');


        res.status(201).json(newRoom);
    } catch (error) {
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
});

// @desc    User joins a room
// @route   POST /api/rooms/join
router.post('/join', protect, async (req, res) => {
    const { joinCode } = req.body;
    try {
        const room = await Room.findOne({ joinCode: joinCode });

        if (!room) {
            return res.status(404).json({ message: 'Room not found with that join code.' });
        }
        if (room.members.includes(req.user._id)) {
            return res.status(400).json({ message: 'You are already a member of this room.' });
        }
        if (room.members.length >= room.maxMembers) {
            return res.status(400).json({ message: 'Room is full.' });
        }

        room.members.push(req.user._id);
        await room.save();

        // Log the activity and emit
        await logAndEmit(io, room, req.user, `${req.user.name} joined the room.`, 'join');


        res.json({ message: 'Successfully joined room!', room });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    User leaves their current room
// @route   POST /api/rooms/leave
router.post('/leave', protect, async (req, res) => {
    try {
        const room = await Room.findOne({ members: req.user._id });

        if (!room) {
            return res.status(404).json({ message: 'You are not a member of any room.' });
        }

        const userObjectId = req.user._id;

        if (room.createdBy.equals(userObjectId)) {
            if (room.members.length === 1) {
                await Room.findByIdAndDelete(room._id);
                // No activity log needed as the room is gone
                return res.json({ message: 'Room deleted as you were the last member.' });
            } else {
                const otherMembers = room.members.filter(memberId => !memberId.equals(userObjectId));
                room.createdBy = otherMembers[0];
                room.members.pull(userObjectId);
                await room.save();
                // Log the activity and emit
                await logAndEmit(io, room, req.user, `${req.user.name} left the room.`, 'leave');

                return res.json({ message: 'You have left the room. A new owner has been assigned.' });
            }
        } else {
            room.members.pull(userObjectId);
            await room.save();
            // Log the activity and emit
            await logAndEmit(io, room, req.user, `${req.user.name} left the room.`, 'leave');

            return res.json({ message: 'You have left the room successfully.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Owner removes a member from their room
// @route   DELETE /api/rooms/remove-member/:memberId
router.delete('/remove-member/:memberId', protect, async (req, res) => {
    try {
        const room = await Room.findOne({ createdBy: req.user._id });
        if (!room) {
            return res.status(401).json({ message: 'You are not the room owner.' });
        }

        const memberIdToRemove = req.params.memberId;

        if (memberIdToRemove === req.user._id.toString()) {
            return res.status(400).json({ message: 'You cannot remove yourself.' });
        }

        if (!room.members.includes(memberIdToRemove)) {
            return res.status(404).json({ message: 'Member not found in this room.' });
        }
        
        room.members.pull(memberIdToRemove);
        await room.save();
        
        const removedUser = await User.findById(memberIdToRemove);
        
        // Log the activity and emit
        await logAndEmit(io, room, req.user, `${req.user.name} removed ${removedUser.name} from the room.`, 'leave');

        res.json({ message: 'Member removed successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
});

    return router;
};