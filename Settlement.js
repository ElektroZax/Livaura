const mongoose = require('mongoose');

const SettlementSchema = new mongoose.Schema({
    room: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true,
    },
    paidBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Settlement', SettlementSchema);