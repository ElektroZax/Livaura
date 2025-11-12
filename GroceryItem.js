const mongoose = require('mongoose');

const GroceryItemSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide an item name'],
        trim: true,
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
    isPurchased: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});

const GroceryItem = mongoose.model('GroceryItem', GroceryItemSchema);
module.exports = GroceryItem;