const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    room: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    userName: { // Store the name for convenience
        type: String,
        required: true,
    },
    text: {
        type: String,
        required: [true, 'Message text cannot be empty'],
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Message', MessageSchema);