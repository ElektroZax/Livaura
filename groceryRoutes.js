const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const GroceryItem = require('../models/GroceryItem');
const Room = require('../models/Room');
const Expense = require('../models/Expense');
const Activity = require('../models/Activity');

// Middleware to get user's room and attach to request
const getUserRoom = async (req, res, next) => {
    const room = await Room.findOne({ members: req.user._id });
    if (!room) {
        return res.status(404).json({ message: 'You are not in a room.' });
    }
    req.room = room;
    next();
};

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

// @desc    Get all non-purchased items for the user's room
router.get('/', protect, getUserRoom, async (req, res) => {
    try {
        const items = await GroceryItem.find({ room: req.room._id, isPurchased: false })
            .populate('addedBy', 'name')
            .sort({ createdAt: 'desc' });
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Add a new item to the grocery list
router.post('/add', protect, getUserRoom, async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Item name is required' });
    }

    try {
        const newItem = await GroceryItem.create({
            name,
            room: req.room._id,
            addedBy: req.user._id,
        });

        // Log the activity and emit
        await logAndEmit(io, req.room, req.user, `${req.user.name} added a grocery item: ${name}`, 'expense');


        res.status(201).json(newItem);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Mark an item as purchased
router.put('/:id/purchase', protect, getUserRoom, async (req, res) => {
    try {
        const item = await GroceryItem.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }
        
        if (item.room.toString() !== req.room._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }
        
        const { amount } = req.body;
        if (!amount || isNaN(amount)) {
            return res.status(400).json({ message: 'Amount is required' });
        }

        await Expense.create({
            description: item.name,
            amount,
            room: req.room._id,
            addedBy: req.user._id,
        });

        // Log the activity and emit
        await logAndEmit(io, req.room, req.user, `${req.user.name} purchased a grocery item: ${item.name}`, 'purchase');


        item.isPurchased = true;
        await item.save();

        res.json({ message: 'Item marked as purchased and expense added.' });

    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});
    return router;
};