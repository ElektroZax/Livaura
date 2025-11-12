const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true, // Each email must be unique
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 6,
    select: false, // Don't send the password back in responses
  },
}, {
  timestamps: true // Adds createdAt and updatedAt fields automatically
});

// This function runs BEFORE a user document is saved to the database
UserSchema.pre('save', async function(next) {
  // If the password hasn't been modified, skip this
  if (!this.isModified('password')) {
    next();
  }

  // Hash the password
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare entered password with the hashed password in the DB
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
}

const User = mongoose.model('User', UserSchema);

module.exports = User;