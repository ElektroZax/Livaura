const mongoose = require('mongoose');

const CalendarEventSchema = new mongoose.Schema({
    summary: {
        type: String,
        required: true,
        trim: true,
    },
    start: {
        type: Date,
        required: true,
    },
    end: {
        type: Date,
        required: true,
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    room: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('CalendarEvent', CalendarEventSchema);