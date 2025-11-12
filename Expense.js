const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema({
    description: {
        type: String,
        required: [true, 'Please provide a description'],
        trim: true,
    },
    amount: {
        type: Number,
        required: [true, 'Please provide an amount'],
    },
    room: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true,
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Expense', ExpenseSchema);