const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    location: { type: String, required: true, trim: true },
    contact: { type: String, required: true },
    isPublic: { type: Boolean, default: false },
    maxMembers: { type: Number, required: true, min: 1 },
    joinCode: { type: String, unique: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// Function to generate a random 6-character code before saving
RoomSchema.pre('save', function(next) {
    if (!this.joinCode) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        this.joinCode = code;
    }
    next();
});

module.exports = mongoose.model('Room', RoomSchema);