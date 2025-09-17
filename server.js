require('dotenv').config(); // Reads variables from .env for local development
const express = require('express');
const cors = require('cors');
const path = require('path');
const { google } = require('googleapis');
const twilio = require('twilio');

const app = express();
const port = process.env.PORT || 3000; // Hosting providers often set the PORT in the environment

// --- Google Drive API Configuration ---
const KEYFILEPATH = path.join(__dirname, 'credentials.json');
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

// Reads your Folder ID from environment variables
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: SCOPES,
});

// --- Twilio Configuration ---
// Reads your Twilio credentials from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Reads your Twilio and personal numbers from environment variables
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;
const yourWhatsAppNumber = process.env.YOUR_WHATSAPP_NUMBER;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (HTML, CSS, JS) from the current directory
app.use(express.static(__dirname));

// Root route - serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- API Endpoint to get photo list ---
app.get('/get-photos', async (req, res) => {
    try {
        console.log('Fetching photos from Google Drive...');
        console.log(`Folder ID: ${FOLDER_ID}`);
        
        const drive = google.drive({ version: 'v3', auth });
        
        try {
            await drive.files.get({ fileId: FOLDER_ID, fields: 'id' });
        } catch (folderError) {
            console.error('Error accessing folder:', folderError.message);
            if (folderError.code === 404) {
                return res.status(404).json({ error: 'Google Drive folder not found. Check your FOLDER_ID.' });
            } else if (folderError.code === 403) {
                return res.status(403).json({ error: 'Access denied to Google Drive folder. Check service account permissions.' });
            }
            throw folderError;
        }
        
        const response = await drive.files.list({
            q: `'${FOLDER_ID}' in parents and mimeType contains 'image/' and trashed=false`,
            fields: 'files(id, name, mimeType, webContentLink)',
            pageSize: 1000,
        });

        const files = response.data.files;
        if (!files || files.length === 0) {
            return res.status(404).json({ error: 'No image files found in the specified Google Drive folder.' });
        }
        
        const photoData = files.map(file => ({
            id: file.id,
            name: file.name,
            url: `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`,
            alternativeUrls: [`https://drive.google.com/uc?export=view&id=${file.id}`, file.webContentLink].filter(Boolean)
        }));

        res.json(photoData);

    } catch (error) {
        console.error('Failed to fetch photos from Google Drive:', error);
        res.status(500).json({ error: 'An internal server error occurred while fetching photos.' });
    }
});

// --- API Endpoint to handle form submission ---
app.post('/submit', async (req, res) => {
    const { clientName, clientEmail, clientPhone, selectedPhotos } = req.body;

    if (!clientName || !clientEmail || !selectedPhotos || selectedPhotos.length === 0) {
        return res.status(400).json({ error: 'Missing required fields or photo selections.' });
    }

    const photoList = selectedPhotos.map((photo, index) => `${index + 1}. ${photo.name}`).join('\n');

    const messageBody = `
        New Photo Selection Received! 🎉
        \n----------------------------------
        \n*Client Details:*
        *Name:* ${clientName}
        *Email:* ${clientEmail}
        *Phone:* ${clientPhone}
        \n----------------------------------
        \n*Selected Photos (${selectedPhotos.length}):*
        \n${photoList}
    `;

    try {
        const message = await client.messages.create({
            from: twilioWhatsAppNumber,
            to: yourWhatsAppNumber,
            body: messageBody,
        });

        console.log('WhatsApp message sent successfully! SID:', message.sid);
        res.status(200).json({ message: 'Submission received and notification sent.' });
    } catch (error) {
        console.error('Failed to send WhatsApp message:', error);
        res.status(500).json({ error: 'Failed to send WhatsApp notification.' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});