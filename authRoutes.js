// Livaura1/Backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Room = require('../models/Room');
const admin = require('firebase-admin'); // ADDED

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @desc    Register a new user
// @route   POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, fbToken } = req.body; // Expect fbToken
  try {
    // 1. Verify the Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(fbToken);
    } catch (error) {
        return res.status(401).json({ message: 'Invalid Firebase ID Token' });
    }

    // Ensure the email matches the verified token email
    if (decodedToken.email !== email) {
        return res.status(400).json({ message: 'Email mismatch between request and token.' });
    }
    
    // 2. Check MongoDB for existing user
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User with that email already exists' });
    }
    
    // 3. Create user in MongoDB with a dummy password
    // The password field is kept for schema consistency and matchPassword method, 
    // but the actual authentication is done by Firebase.
    const DUMMY_FIREBASE_PASSWORD = 'firebase_authenticated_user';
    
    const user = await User.create({ 
        name, 
        email, 
        password: DUMMY_FIREBASE_PASSWORD 
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        token: generateToken(user._id), // Use your custom JWT
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

// @desc    Authenticate user and get token
// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, fbToken } = req.body; // Expect fbToken, not password
  try {
    // 1. Verify the Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(fbToken);
    } catch (error) {
        return res.status(401).json({ message: 'Invalid Firebase ID Token' });
    }
    
    // Ensure the email matches the verified token email
    if (decodedToken.email !== email) {
        return res.status(400).json({ message: 'Email mismatch between request and token.' });
    }

    // 2. Find user in MongoDB using the verified email
    const user = await User.findOne({ email });

    if (user) {
      const room = await Room.findOne({ members: user._id });
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        token: generateToken(user._id), // Use your custom JWT
        isInRoom: !!room
      });
    } else {
      // User is authenticated with Firebase but not registered in MongoDB (should not happen in normal flow)
      res.status(404).json({ message: 'User not found in local database.' });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: 'Server Error: ' + error.message });
  }
});

module.exports = router;