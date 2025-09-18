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

const client = new MongoClient(process.env.MONGO_URI);
let db;

const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Using a readonly scope as the server no longer needs to write files to Drive.
const googleAuth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'] 
});
const drive = google.drive({ version: 'v3', auth: googleAuth });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function extractFolderIdFromUrl(url) {
    const patterns = [ /\/folders\/([a-zA-Z0-9-_]+)/, /id=([a-zA-Z0-9-_]+)/ ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    if (url && url.length > 20 && !url.includes('/')) { return url; }
    return null;
}
const createSlug = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
const checkAdminAuth = (req, res, next) => { try { const token = req.headers.authorization.split(" ")[1]; jwt.verify(token, process.env.JWT_SECRET); next(); } catch (error) { return res.status(401).json({ message: 'Admin authentication failed.' }); } };
const checkClientAuth = (req, res, next) => { try { const token = req.headers.authorization.split(" ")[1]; req.clientData = jwt.verify(token, process.env.JWT_SECRET); next(); } catch (error) { return res.status(401).json({ message: 'Client authentication failed.' }); } };

// --- API: ADMIN ---
app.post('/api/login', async (req, res) => { try { const { username, password } = req.body; const user = await db.collection('users').findOne({ username: username.toLowerCase() }); if (!user || !(await bcrypt.compare(password, user.password))) { return res.status(401).json({ message: 'Invalid admin credentials.' }); } const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: '8h' }); res.status(200).json({ message: 'Admin login successful', token, username: user.username }); } catch (error) { res.status(500).json({ message: 'An internal server error occurred.' }); }});
app.get('/api/contacts', checkAdminAuth, async (req, res) => { try { const contacts = await db.collection('contacts').find().sort({ lastSubmittedAt: -1 }).toArray(); res.status(200).json(contacts); } catch (error) { res.status(500).json({ message: 'Failed to fetch contacts.' }); }});
app.delete('/api/contacts/:id', checkAdminAuth, async (req, res) => { try { const contactId = new ObjectId(req.params.id); const result = await db.collection('contacts').deleteOne({ _id: contactId }); if (result.deletedCount === 0) { return res.status(404).json({ message: 'Contact not found.' }); } res.status(200).json({ message: 'Contact deleted successfully.' }); } catch (error) { res.status(500).json({ message: 'Failed to delete contact.' }); }});
app.get('/api/submissions', checkAdminAuth, async (req, res) => { try { const submissions = await db.collection('submissions').find().toArray(); res.status(200).json(submissions); } catch (error) { res.status(500).json({ message: 'Failed to fetch submissions.' }); }});
app.get('/api/clients', checkAdminAuth, async (req, res) => { const clients = await db.collection('clients').find({}, { projection: { password: 0 } }).sort({ name: 1 }).toArray(); res.status(200).json(clients); });
app.post('/api/clients', checkAdminAuth, async (req, res) => { try { const { name, username, password } = req.body; if (!name || !username || !password) { return res.status(400).json({ message: 'Name, username, and password are required.' }); } if (await db.collection('clients').findOne({ username: username.toLowerCase() })) { return res.status(409).json({ message: 'This username is already taken.' }); } const hashedPassword = await bcrypt.hash(password, 10); const newClient = { name, username: username.toLowerCase(), password: hashedPassword, galleryIds: [], createdAt: new Date() }; await db.collection('clients').insertOne(newClient); res.status(201).json({ message: 'Client created successfully.' }); } catch (error) { res.status(500).json({ message: 'Failed to create client.' }); }});
app.put('/api/clients/:id', checkAdminAuth, async (req, res) => { try { const { id } = req.params; const { name, username, password } = req.body; if (!name || !username) { return res.status(400).json({ message: 'Name and username are required.' }); } const updateData = { name, username: username.toLowerCase() }; const existingClient = await db.collection('clients').findOne({ username: username.toLowerCase(), _id: { $ne: new ObjectId(id) } }); if (existingClient) { return res.status(409).json({ message: 'This username is already taken.' }); } if (password) { updateData.password = await bcrypt.hash(password, 10); } await db.collection('clients').updateOne({ _id: new ObjectId(id) }, { $set: updateData }); res.status(200).json({ message: 'Client updated successfully.' }); } catch (error) { res.status(500).json({ message: 'Failed to update client.' }); }});
app.put('/api/clients/:id/galleries', checkAdminAuth, async (req, res) => { try { const { id } = req.params; const { galleryIds } = req.body; const galleryObjectIds = galleryIds.map(gid => new ObjectId(gid)); await db.collection('clients').updateOne( { _id: new ObjectId(id) }, { $set: { galleryIds: galleryObjectIds } } ); res.status(200).json({ message: 'Client galleries updated successfully.' }); } catch (error) { res.status(500).json({ message: 'Failed to update client galleries.' }); }});
app.delete('/api/clients/:id', checkAdminAuth, async (req, res) => { try { await db.collection('clients').deleteOne({ _id: new ObjectId(req.params.id) }); res.status(200).json({ message: 'Client deleted successfully.' }); } catch (error) { res.status(500).json({ message: 'Failed to delete client.' }); }});
app.get('/api/galleries', checkAdminAuth, async (req, res) => { const galleries = await db.collection('galleries').find().sort({ createdAt: -1 }).toArray(); res.status(200).json(galleries); });
app.post('/api/galleries', checkAdminAuth, async (req, res) => { try { const { name, folderLink, clientId } = req.body; const folderId = extractFolderIdFromUrl(folderLink); if (!name || !folderId) { return res.status(400).json({ message: 'Gallery name and a valid Google Drive link are required.' }); } const slug = createSlug(name); if (await db.collection('galleries').findOne({ slug })) { return res.status(409).json({ message: 'A gallery with this name already exists.' }); } const newGallery = { name, folderId, slug, createdAt: new Date() }; const result = await db.collection('galleries').insertOne(newGallery); if (clientId) { await db.collection('clients').updateOne( { _id: new ObjectId(clientId) }, { $push: { galleryIds: result.insertedId } } ); } res.status(201).json({ message: 'Gallery created successfully' }); } catch (error) { res.status(500).json({ message: 'Failed to create gallery.' }); }});
app.delete('/api/galleries/:id', checkAdminAuth, async (req, res) => { try { const galleryId = new ObjectId(req.params.id); await db.collection('clients').updateMany({}, { $pull: { galleryIds: galleryId } }); await db.collection('galleries').deleteOne({ _id: galleryId }); res.status(200).json({ message: 'Gallery deleted successfully.' }); } catch (error) { res.status(500).json({ message: 'Failed to delete gallery.' }); }});

// --- API: CLIENT ---
app.post('/api/client-login', async (req, res) => { try { const { username, password, slug } = req.body; const clientUser = await db.collection('clients').findOne({ username: username.toLowerCase() }); if (!clientUser || !(await bcrypt.compare(password, clientUser.password))) { return res.status(401).json({ message: 'Invalid client credentials.' }); } const gallery = await db.collection('galleries').findOne({ slug }); if (!gallery || !clientUser.galleryIds.some(id => id.equals(gallery._id))) { return res.status(403).json({ message: 'Access denied. You are not assigned to this gallery.' }); } const token = jwt.sign({ clientId: clientUser._id }, process.env.JWT_SECRET, { expiresIn: '8h' }); res.status(200).json({ message: 'Client login successful', token }); } catch (error) { res.status(500).json({ message: 'An internal server error occurred.' }); }});
app.get('/api/my-gallery', checkClientAuth, async (req, res) => { try { const { slug } = req.query; if (!slug) return res.status(400).json({ error: 'Gallery slug is required.' }); const clientUser = await db.collection('clients').findOne({ _id: new ObjectId(req.clientData.clientId) }); const gallery = await db.collection('galleries').findOne({ slug }); if (!gallery || !clientUser.galleryIds.some(id => id.equals(gallery._id))) { return res.status(404).json({ error: 'Gallery not found or access denied.' }); } const response = await drive.files.list({ q: `'${gallery.folderId}' in parents and mimeType contains 'image/' and trashed=false`, fields: 'files(id, name)', pageSize: 1000, orderBy: 'name' }); if (!response.data.files) return res.json({ photos: [], totalPages: 0 }); const allFiles = response.data.files; const page = parseInt(req.query.page) || 1; const limit = parseInt(req.query.limit) || 50; const startIndex = (page - 1) * limit; const endIndex = page * limit; const totalPages = Math.ceil(allFiles.length / limit); const paginatedFiles = allFiles.slice(startIndex, endIndex); const photoData = paginatedFiles.map(file => ({ id: file.id, name: file.name, url: `https://drive.google.com/thumbnail?id=${file.id}&sz=w400` })); res.json({ photos: photoData, totalPages, totalPhotos: allFiles.length }); } catch (error) { res.status(500).json({ error: 'Failed to fetch photos.' }); }});
app.get('/api/image/:fileId', async (req, res) => { try { const { fileId } = req.params; const fileStream = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' }); fileStream.data.pipe(res); } catch (error) { res.status(500).send('Error fetching image.'); }});

app.post('/submit', async (req, res) => {
    try {
        const { clientName, clientEmail, clientPhone, selectedPhotos, gallerySlug } = req.body;
        
        // Save submission details to your database
        await db.collection('submissions').insertOne({ clientName, clientEmail, clientPhone, selectedPhotos, submittedAt: new Date(), gallerySlug });
        await db.collection('contacts').updateOne(
            { email: clientEmail.toLowerCase() },
            { $set: { name: clientName, phone: clientPhone, email: clientEmail.toLowerCase() }, $setOnInsert: { createdAt: new Date() }, $currentDate: { lastSubmittedAt: true } },
            { upsert: true }
        );

        // Find the gallery to get its name and original folder ID
        const gallery = await db.collection('galleries').findOne({ slug: gallerySlug });
        if (!gallery) throw new Error('Gallery information could not be found.');

        // --- UPDATED MESSAGE LOGIC ---
        const newFolderName = `${clientName} - ${gallery.name} - Selections`;
        const sourceFolderLink = `https://drive.google.com/drive/folders/${gallery.folderId}`;
        
        // Format the file names with " OR " between them for easy searching.
        // Quoting each filename handles names with spaces.
        const fileNamesForSearch = selectedPhotos.map(photo => `"${photo.name}"`).join(' OR ');

        // Construct the detailed message for manual action
        const messageBody = `*New Photo Selection Ready for Processing!* ✅\n\n*Client Name:*\n${clientName}\n\n*Phone Number:*\n${clientPhone}\n\n*Total Photos Selected:*\n${selectedPhotos.length}\n\n*Action Required:*\n1. Create a new folder named: *"${newFolderName}"*\n2. Go to the source gallery: ${sourceFolderLink}\n3. Copy the text below and paste it into the Drive search bar to find all selected images.\n\n*Search Query:*\n${fileNamesForSearch}`;

        await twilioClient.messages.create({
            body: messageBody,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: process.env.YOUR_WHATSAPP_NUMBER
        });

        res.status(200).json({ message: 'Selections submitted successfully!' });

    } catch (error) {
        console.error("Submission Error:", error);
        const errorMessage = `⚠️ *Error during photo selection submission!* ⚠️\n\n*Client:* ${req.body.clientName}\n*Issue:* Could not process submission or send detailed notification.\n\n*Error Details:*\n${error.message}\n\nPlease check the server logs.`;
        await twilioClient.messages.create({ body: errorMessage, from: process.env.TWILIO_WHATSAPP_NUMBER, to: process.env.YOUR_WHATSAPP_NUMBER }).catch(console.error);
        res.status(500).json({ error: 'Failed to process submission.' });
    }
});


// --- Public Page Routes & Server Start ---
app.get('/gallery/:slug', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/', (req, res) => res.redirect('/dashboard'));

async function startServer() {
    try {
        await client.connect();
        console.log('✅ Connected successfully to MongoDB');
        db = client.db('photo-gallery-db');
        app.listen(port, () => console.log(`🚀 Server is running at http://localhost:${port}`));
    } catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
}
startServer();