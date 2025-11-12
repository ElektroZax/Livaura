const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
    description: {
        type: String,
        required: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    room: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true,
    },
    type: {
        type: String,
        enum: ['join', 'leave', 'expense', 'purchase', 'lock', 'calendar', 'chat'],
        required: true,
    }
}, {
    timestamps: true,
});

module.exports = mongoose.model('Activity', ActivitySchema);