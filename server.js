const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const admin = require('firebase-admin');

dotenv.config();

// ADDED: Firebase Admin SDK Initialization
if (process.env.FIREBASE_PROJECT_ID) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                type: process.env.FIREBASE_TYPE,
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                clientId: process.env.FIREBASE_CLIENT_ID,
                authUri: process.env.FIREBASE_AUTH_URI,
                tokenUri: process.env.FIREBASE_TOKEN_URI,
                authProviderX509CertUrl: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
                clientC509CertUrl: process.env.FIREBASE_CLIENT_X509_CERT_URL,
            }),
        });
        console.log('✅ Firebase Admin SDK initialized successfully.');
    } catch (error) {
        console.error('❌ Error initializing Firebase Admin SDK:', error.message);
    }
} else {
    console.warn("⚠️ Firebase Project ID not found. Skipping Firebase Admin SDK initialization.");
}

if (!process.env.MONGODB_URI) {
    console.error("FATAL ERROR: MONGODB_URI is not defined in your .env file.");
    process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
.then(() => console.log('✅ Successfully connected to MongoDB.'))
.catch((err) => console.error('❌ Error connecting to MongoDB:', err));

// --- API Routes (io passed to all activity-related routes) ---
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes')(io);
const groceryRoutes = require('./routes/groceryRoutes')(io);
const requestRoutes = require('./routes/requestRoutes')(io);
const expenseRoutes = require('./routes/expenseRoutes')(io);
const calendarRoutes = require('./routes/calendarRoutes')(io);
const activityRoutes = require('./routes/activityRoutes');
const messageRoutes = require('./routes/messageRoutes')(io);
const chatHandler = require('./routes/chatHandler')(io);

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/groceries', groceryRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/activities', activityRoutes);

server.listen(PORT, () => {
  console.log(`🚀 Server is listening on http://localhost:${PORT}`);
});