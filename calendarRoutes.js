const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const CalendarEvent = require('../models/CalendarEvent');
const Room = require('../models/Room');
const Activity = require('../models/Activity');
const User = require('../models/User');

// Middleware to get user's room and attach to request
const getUserRoom = async (req, res, next) => {
    try {
        const room = await Room.findOne({ members: req.user._id });
        if (!room) {
            return res.status(404).json({ message: 'You are not in a room.' });
        }
        req.room = room;
        next();
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

// Utility function to log and emit
const logAndEmit = async (io, room, user, description, type) => {
    // 1. Log to DB
    await Activity.create({ description, user: user._id, room: room._id, type });
    
    // 2. Emit Real-time notification
    io.to(room._id.toString()).emit('activityNotification', {
        description: description,
        type: type,
        userName: user.name,
        timestamp: new Date()
    });
};

module.exports = (io) => { // WRAPPED ROUTER IN FUNCTION TO ACCEPT IO

// @desc    Fetch a calendar's events for the user's room
// @route   GET /api/calendar/events
router.get('/events', protect, getUserRoom, async (req, res) => {
    try {
        const calendarEvents = await CalendarEvent.find({ room: req.room._id })
            .populate('addedBy', 'name')
            .sort({ start: 'asc' });

        res.json(calendarEvents);
    } catch (error) {
        console.error('Error fetching calendar events:', error);
        res.status(500).json({ message: 'Could not fetch calendar events.' });
    }
});

// @desc    Add a new event to the calendar
// @route   POST /api/calendar/events
router.post('/events', protect, getUserRoom, async (req, res) => {
    const { summary, start, end } = req.body;
    if (!summary || !start || !end) {
        return res.status(400).json({ message: 'Missing required event data: summary, start, or end.' });
    }

    try {
        // Create the event
        const newEvent = await CalendarEvent.create({
            summary,
            start: new Date(start),
            end: new Date(end),
            room: req.room._id,
            addedBy: req.user._id,
        });

        // Log the activity and EMIT the notification
        // req.room is guaranteed to be available from getUserRoom middleware
        await logAndEmit(io, req.room, req.user, `${req.user.name} added a calendar event: ${summary}`, 'calendar');

        // Send a successful response
        res.status(201).json(newEvent);
    } catch (error) {
        console.error('Error adding calendar event:', error);
        res.status(500).json({ message: 'Error adding event. See server logs for details.' });
    }
});

// @desc    Delete an event
// @route   DELETE /api/calendar/events/:id
router.delete('/events/:id', protect, async (req, res) => {
    try {
        const eventId = req.params.id;
        const event = await CalendarEvent.findById(eventId);
        
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        
        if (event.addedBy.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized to delete this event.' });
        }

        const eventSummary = event.summary;
        const eventRoomId = event.room;
        
        // Delete the event
        await event.deleteOne();

        // Log the activity and EMIT the notification
        const eventRoom = await Room.findById(eventRoomId); 
        if (eventRoom) {
            await logAndEmit(io, eventRoom, req.user, `${req.user.name} deleted a calendar event: ${eventSummary}`, 'calendar');
        }

        // Send a successful response
        res.json({ message: 'Event deleted successfully.' });
    } catch (error) {
        console.error('Error deleting calendar event:', error);
        res.status(500).json({ message: 'Error deleting event. See server logs for details.' });
    }
});
    return router;
};