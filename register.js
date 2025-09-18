require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const readline = require('readline');

const client = new MongoClient(process.env.MONGO_URI);
const saltRounds = 10;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function registerAdmin() {
  try {
    await client.connect();
    const db = client.db('photo-gallery-db');
    const usersCollection = db.collection('users');

    rl.question('Enter a username for the admin account: ', async (username) => {
      rl.question('Enter a password for the admin account: ', async (password) => {
        if (!username || !password) {
          console.error('Username and password cannot be empty.');
          rl.close();
          await client.close();
          return;
        }

        const existingUser = await usersCollection.findOne({ username });
        if (existingUser) {
          console.error('Error: A user with this username already exists.');
          rl.close();
          await client.close();
          return;
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        await usersCollection.insertOne({
          username: username.toLowerCase(),
          password: hashedPassword,
          createdAt: new Date()
        });

        console.log('✅ Admin user created successfully!');
        rl.close();
        await client.close();
      });
    });
  } catch (err) {
    console.error('Failed to register admin user:', err);
    await client.close();
    rl.close();
  }
}

registerAdmin();