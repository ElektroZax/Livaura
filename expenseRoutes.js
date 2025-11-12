const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Expense = require('../models/Expense');
const Room = require('../models/Room');
const Settlement = require('../models/Settlement');
const Activity = require('../models/Activity');
const User = require('../models/User');

// Middleware to get user's room and attach to request
const getUserRoom = async (req, res, next) => {
    try {
        const room = await Room.findOne({ members: req.user._id });
        if (!room) { return res.status(404).json({ message: 'You are not in a room.' }); }
        req.room = room;
        next();
    } catch (error) { res.status(500).json({ message: 'Server Error' }); }
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

// --- HELPER FUNCTION FOR CORRECTED CALCULATIONS (omitted for brevity) ---
const calculateEffectiveContributions = async (roomId) => {
    const room = await Room.findById(roomId).populate('members', 'name');
    if (!room || room.members.length === 0) {
        return { contributions: {}, total: 0, perHead: 0, members: [] };
    }

    const expenses = await Expense.find({ room: roomId });
    const settlements = await Settlement.find({ room: roomId });

    const total = expenses.reduce((acc, exp) => acc + (Number.isFinite(exp.amount) ? exp.amount : 0), 0);
    const perHead = total / room.members.length;

    // 1. Calculate initial contributions from expenses
    const contributions = new Map();
    room.members.forEach(member => contributions.set(member._id.toString(), 0));
    expenses.forEach(exp => {
        if (exp.addedBy) {
            const memberId = exp.addedBy.toString();
            if (contributions.has(memberId)) {
                contributions.set(memberId, contributions.get(memberId) + exp.amount);
            }
        }
    });

    // 2. Identify who is owed money (creditors)
    const creditors = [];
    let totalDebt = 0;
    contributions.forEach((amount, memberId) => {
        const credit = amount - perHead;
        if (credit > 0) {
            creditors.push({ memberId, credit });
            totalDebt += credit;
        }
    });

    // 3. Distribute settlement payments to creditors
    let totalSettled = settlements.reduce((acc, s) => acc + s.amount, 0);
    if (totalDebt > 0) {
        creditors.forEach(c => {
            const proportion = c.credit / totalDebt;
            const creditReceived = proportion * totalSettled;
            contributions.set(c.memberId, contributions.get(c.memberId) - creditReceived);
        });
    }

    // 4. Add settlement amounts to the payers' contributions
    settlements.forEach(s => {
        if (s.paidBy) {
            const memberId = s.paidBy.toString();
            if (contributions.has(memberId)) {
                contributions.set(memberId, contributions.get(memberId) + s.amount);
            }
        }
    });

    return { contributions, total, perHead, members: room.members };
};


module.exports = (io) => { // WRAPPED ROUTER IN FUNCTION TO ACCEPT IO

// --- DEFINITIVE, CORRECTED ROUTES ---

router.get('/', protect, getUserRoom, async (req, res) => {
    try {
        const expenses = await Expense.find({ room: req.room._id }).populate('addedBy', 'name').sort({ createdAt: 'desc' });
        res.json(expenses.filter(exp => exp && typeof exp.amount === 'number'));
    } catch (error) { res.status(500).json({ message: 'Server Error' }); }
});

router.get('/chart-data', protect, getUserRoom, async (req, res) => {
    try {
        const { contributions, members } = await calculateEffectiveContributions(req.room._id);
        const chartData = {};
        members.forEach(member => {
            const contribution = contributions.get(member._id.toString()) || 0;
            // Only show contributions > 0 in the chart
            if (contribution > 0.01) {
                chartData[member.name] = contribution;
            }
        });
        res.json(chartData);
    } catch (error) { res.status(500).json({ message: 'Server Error getting chart data' }); }
});

router.get('/split', protect, getUserRoom, async (req, res) => {
    try {
        const { contributions, total, perHead, members } = await calculateEffectiveContributions(req.room._id);
        const balances = {};
        members.forEach(member => {
            const memberOwes = perHead - (contributions.get(member._id.toString()) || 0);
            balances[member.name] = { owes: memberOwes, userId: member._id };
        });
        res.json({ total, perHead, balances });
    } catch (error) { res.status(500).json({ message: 'Server Error calculating split data' }); }
});

// POST /api/expenses - Add a new expense
router.post('/', protect, getUserRoom, async (req, res) => {
    const { desc, amount } = req.body;
    try {
        const expense = await Expense.create({
            description: desc, amount, room: req.room._id, addedBy: req.user._id
        });
        
        // Log the activity and emit
        await logAndEmit(io, req.room, req.user, `${req.user.name} added an expense: ${desc} for ₹${amount}`, 'expense');
        
        res.status(201).json(expense);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST /api/expenses/settle - Settle a user's debt
router.post('/settle', protect, getUserRoom, async (req, res) => {
    try {
        // Recalculate balances from scratch to ensure accuracy
        const expenses = await Expense.find({ room: req.room._id });
        const settlements = await Settlement.find({ room: req.room._id });
        const memberCount = req.room.members.length;
        
        if (memberCount === 0) {
            return res.status(400).json({ message: 'No members in the room.' });
        }
        
        const total = expenses.reduce((acc, exp) => acc + exp.amount, 0);
        const perHead = total / memberCount;
        
        let userContribution = 0;
        expenses.forEach(e => { if(e.addedBy.equals(req.user._id)) userContribution += e.amount; });
        settlements.forEach(s => { if(s.paidBy.equals(req.user._id)) userContribution += s.amount; });

        const amountOwed = perHead - userContribution;

        // Use a small threshold to handle floating-point inaccuracies
        if (amountOwed <= 0.01) {
            return res.status(400).json({ message: 'You do not have an outstanding balance to settle.' });
        }

        await Settlement.create({
            room: req.room._id,
            paidBy: req.user._id,
            amount: amountOwed
        });
        
        // Log the activity and emit (added log)
        await logAndEmit(io, req.room, req.user, `${req.user.name} settled their expenses for ₹${amountOwed.toFixed(2)}`, 'expense');


        res.json({ message: 'Balance settled successfully.' });
    } catch (error) {
        console.error('Settle error:', error);
        res.status(500).json({ message: 'Server Error during settlement.' });
    }
});


// DELETE /api/expenses/clear - Clear all expenses AND settlements (owner only)
router.delete('/clear', protect, getUserRoom, async (req, res) => {
    // Specific routes like '/clear' must come before parameterized routes like '/:id'
    if (req.room.createdBy.toString() !== req.user._id.toString()) {
        return res.status(401).json({ message: 'Not authorized' });
    }
    try {
        await Expense.deleteMany({ room: req.room._id });
        await Settlement.deleteMany({ room: req.room._id });
        res.json({ message: 'All expenses and settlements have been cleared.' });
    } catch (error) {
        console.error('Clear error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// DELETE /api/expenses/:id - Delete a single expense
router.delete('/:id', protect, getUserRoom, async (req, res) => {
    try {
        const expense = await Expense.findById(req.params.id);

        if (!expense) {
            return res.status(404).json({ message: 'Expense not found.' });
        }
        
        const isOwner = req.room.createdBy.toString() === req.user._id.toString();
        const isAddedBy = expense.addedBy.toString() === req.user._id.toString();

        if (!isOwner && !isAddedBy) {
            return res.status(403).json({ message: 'Not authorized to delete this expense.' });
        }
        
        await expense.deleteOne();
        res.json({ message: 'Expense removed.' });
    } catch (error) {
        console.error('Delete expense error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST /api/expenses/report - Generate and send a PDF report
router.post('/report', protect, getUserRoom, async (req, res) => {
// ... (omitted for brevity - no changes needed to this large block) ...
});

    return router;
};