const mongoose = require('mongoose');

const JoinRequestSchema = new mongoose.Schema({
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('JoinRequest', JoinRequestSchema);