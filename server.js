require('dotenv').config();
const express = require('express');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// --- Initialize Clients & Middleware ---
const client = new MongoClient(process.env.MONGO_URI);
let db;

const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const googleAuth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
});
const drive = google.drive({ version: 'v3', auth: googleAuth });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- Helper Functions ---
function extractFolderIdFromUrl(url) {
    const patterns = [
        /\/folders\/([a-zA-Z0-9-_]+)/,
        /id=([a-zA-Z0-9-_]+)/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    if (url && url.length > 20 && !url.includes('/')) {
        return url;
    }
    return null;
}

const createSlug = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// --- MIDDLEWARE ---
const checkAdminAuth = (req, res, next) => {
    try {
        const token = req.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.adminData = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Admin authentication failed.' });
    }
};

const checkClientAuth = (req, res, next) => {
    try {
        const token = req.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.clientData = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Client authentication failed.' });
    }
};

// --- API: ADMIN AUTHENTICATION ---
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await db.collection('users').findOne({ username: username.toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid admin credentials.' });
        }
        const token = jwt.sign({ username: user.username, userId: user._id }, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.status(200).json({ message: 'Admin login successful', token });
    } catch (error) {
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// --- API: CLIENT AUTHENTICATION ---
app.post('/api/client-login', async (req, res) => {
    try {
        const { username, password, slug } = req.body;
        if (!username || !password || !slug) {
            return res.status(400).json({ message: 'Username, password, and gallery slug are required.' });
        }

        const client = await db.collection('clients').findOne({ username: username.toLowerCase() });
        if (!client || !(await bcrypt.compare(password, client.password))) {
            return res.status(401).json({ message: 'Invalid client credentials.' });
        }
        
        const gallery = await db.collection('galleries').findOne({ slug, clientId: client._id });
        if (!gallery) {
            return res.status(403).json({ message: 'Access denied. You are not assigned to this gallery.' });
        }

        const token = jwt.sign({ username: client.username, clientId: client._id }, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.status(200).json({ message: 'Client login successful', token });
    } catch (error) {
        console.error('Client login error:', error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// --- API: ADMIN-FACING CLIENT MANAGEMENT ---
app.get('/api/clients', checkAdminAuth, async (req, res) => {
    const clients = await db.collection('clients').find({}, { projection: { password: 0 } }).sort({ name: 1 }).toArray();
    res.status(200).json(clients);
});

app.post('/api/clients', checkAdminAuth, async (req, res) => {
    try {
        const { name, email, username, password } = req.body;
        if (!name || !username || !password) {
            return res.status(400).json({ message: 'Name, username, and password are required.' });
        }
        const existingClient = await db.collection('clients').findOne({ username: username.toLowerCase() });
        if (existingClient) {
            return res.status(409).json({ message: 'A client with this username already exists.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newClient = { name, email, username: username.toLowerCase(), password: hashedPassword, createdAt: new Date() };
        await db.collection('clients').insertOne(newClient);
        res.status(201).json({ message: 'Client created successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create client.' });
    }
});

app.delete('/api/clients/:id', checkAdminAuth, async (req, res) => {
    try {
        const clientId = new ObjectId(req.params.id);
        await db.collection('galleries').updateMany({ clientId }, { $unset: { clientId: "" } });
        const result = await db.collection('clients').deleteOne({ _id: clientId });
        if (result.deletedCount === 0) return res.status(404).json({ message: 'Client not found.' });
        res.status(200).json({ message: 'Client deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete client.' });
    }
});

// --- API: ADMIN-FACING GALLERY MANAGEMENT ---
app.get('/api/galleries', checkAdminAuth, async (req, res) => {
    const galleries = await db.collection('galleries').find().sort({ createdAt: -1 }).toArray();
    res.status(200).json(galleries);
});

app.post('/api/galleries', checkAdminAuth, async (req, res) => {
    try {
        const { name, folderLink, clientId } = req.body;
        const folderId = extractFolderIdFromUrl(folderLink);
        if (!name || !folderId) {
            return res.status(400).json({ message: 'Gallery name and a valid Google Drive link are required.' });
        }
        const slug = createSlug(name);
        if (await db.collection('galleries').findOne({ slug })) {
            return res.status(409).json({ message: 'A gallery with this name already exists.' });
        }
        const newGallery = { name, folderId, slug, createdAt: new Date() };
        if (clientId) {
            newGallery.clientId = new ObjectId(clientId);
        }
        await db.collection('galleries').insertOne(newGallery);
        res.status(201).json({ message: 'Gallery created successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create gallery.' });
    }
});

app.delete('/api/galleries/:id', checkAdminAuth, async (req, res) => {
    try {
        const result = await db.collection('galleries').deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: 'Gallery not found.' });
        res.status(200).json({ message: 'Gallery deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete gallery.' });
    }
});

// --- API: CLIENT-FACING PHOTO FETCHING (with Pagination) ---
app.get('/api/my-gallery', checkClientAuth, async (req, res) => {
    try {
        const gallery = await db.collection('galleries').findOne({ clientId: new ObjectId(req.clientData.clientId) });
        if (!gallery) {
            return res.status(404).json({ error: 'No gallery is assigned to you.' });
        }
        
        const response = await drive.files.list({
            q: `'${gallery.folderId}' in parents and mimeType contains 'image/' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 1000,
            orderBy: 'name'
        });

        if (!response.data.files) return res.json({ photos: [], totalPages: 0 });

        const allFiles = response.data.files;
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const totalPages = Math.ceil(allFiles.length / limit);

        const paginatedFiles = allFiles.slice(startIndex, endIndex);

        const photoData = paginatedFiles.map(file => ({
            id: file.id, name: file.name, url: `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`
        }));
        
        res.json({ photos: photoData, totalPages, totalPhotos: allFiles.length });

    } catch (error) {
        console.error(`Error fetching photos for client "${req.clientData.clientId}":`, error.message);
        res.status(500).json({ error: 'Failed to fetch photos.' });
    }
});

// --- API: Secure Image Proxy Route ---
app.get('/api/image/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!fileId) {
            return res.status(400).send('File ID is required.');
        }

        const fileStream = await drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        fileStream.data
            .on('end', () => res.end())
            .on('error', () => res.status(404).send('Image not found.'))
            .pipe(res);

    } catch (error) {
        console.error('Error proxying image:', error.message);
        res.status(500).send('Error fetching image.');
    }
});

// --- API: Photo Selection Submission ---
app.post('/submit', async (req, res) => {
    try {
        const { clientName, clientEmail, clientPhone, selectedPhotos } = req.body;
        if (!clientName || !clientEmail || !clientPhone || !selectedPhotos || selectedPhotos.length === 0) {
            return res.status(400).json({ error: 'All fields are required.' });
        }
        const submission = { clientName, clientEmail, clientPhone, selectedPhotos, submittedAt: new Date() };
        await db.collection('submissions').insertOne(submission);

        const messageBody = `New photo selection from ${clientName}. ${selectedPhotos.length} photos selected. Email: ${clientEmail}`;
        await twilioClient.messages.create({
            body: messageBody,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: process.env.YOUR_WHATSAPP_NUMBER
        });

        res.status(200).json({ message: 'Selections submitted successfully!' });
    } catch (error) {
        console.error('Error processing submission:', error);
        res.status(500).json({ error: 'Failed to submit selections.' });
    }
});

// --- Public Page Routes ---
app.get('/gallery/:slug', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/', (req, res) => res.redirect('/dashboard'));

// --- Server Start ---
async function startServer() {
    try {
        await client.connect();
        console.log('✅ Connected successfully to MongoDB');
        db = client.db('photo-gallery-db');
        await db.collection('galleries').createIndex({ slug: 1 }, { unique: true });
        await db.collection('clients').createIndex({ username: 1 }, { unique: true });
        
        app.listen(port, () => {
            console.log(`🚀 Server is running at http://localhost:${port}`);
        });
    } catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
}

startServer();