const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;

    // Check for the token in the Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header (e.g., "Bearer <token>")
            token = req.headers.authorization.split(' ')[1];

            // Verify the token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get user from the token's ID and attach it to the request object
            req.user = await User.findById(decoded.id).select('-password');

            next(); // Proceed to the next middleware or route handler
        } catch (error) {
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

module.exports = { protect };