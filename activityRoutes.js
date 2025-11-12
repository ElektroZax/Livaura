const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Activity = require('../models/Activity');
const Room = require('../models/Room');

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

// @desc    Get all activities for the user's room
// @route   GET /api/activities
// @access  Private
router.get('/', protect, getUserRoom, async (req, res) => {
    try {
        const activities = await Activity.find({ room: req.room._id })
            .populate('user', 'name')
            .sort({ createdAt: 'desc' });
        res.json(activities);
    } catch (error) {
        console.error('Error fetching activities:', error);
        res.status(500).json({ message: 'Could not fetch activities.' });
    }
});

// @desc    Owner clears all activities for their room
// @route   DELETE /api/activities/clear
// @access  Private (Owner only)
router.delete('/clear', protect, getUserRoom, async (req, res) => {
    try {
        const room = await Room.findOne({ createdBy: req.user._id });
        if (!room) {
            return res.status(401).json({ message: 'Not authorized to clear activities.' });
        }
        await Activity.deleteMany({ room: req.room._id });
        res.json({ message: 'Activities cleared successfully.' });
    } catch (error) {
        console.error('Error clearing activities:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;