const mongoose = require('mongoose');
const express = require('express');
const app = express();
const path = require('path');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const Schemas = require('./Schemas.js');

// MongoDB connection URL
const url = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(url)
    .then(() => {
        console.log('✅ MongoDB connection successful');
        // Start the server only after MongoDB connection is established
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1); // Exit if we can't connect to MongoDB
    });

// Parse JSON bodies
app.use(express.json());

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Configure session
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Configure Passport
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
},
async (accessToken, refreshToken, profile, done) => {
    try {
        // Check if user exists in database
        let user = await Schemas.User.findOne({ googleId: profile.id });
        
        if (!user) {
            // Create new user if doesn't exist
            user = await Schemas.User.create({
                googleId: profile.id,
                username: profile.displayName,
                email: profile.emails[0].value,
                picture: profile.photos[0].value,
                galleries: [],
                premium: false
            });
        }
        
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

// Serialize and deserialize user
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await Schemas.User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// Google authentication routes
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Update the callback route to handle the Google Sign-In token
app.post('/auth/google/callback', async (req, res) => {
    try {
        console.log('Received request body:', req.body);
        
        if (!req.body || !req.body.credential) {
            console.error('No credential in request body');
            return res.status(400).json({ 
                error: 'Invalid request',
                details: 'No credential provided in request body'
            });
        }

        const credential = req.body.credential;
        
        // Verify the credential with Google's API
        const client = new OAuth2Client(GOOGLE_CLIENT_ID);
        
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        console.log('Google payload:', payload);
        const userid = payload['sub'];

        // Check if user exists in database
        let user = await Schemas.User.findOne({ googleId: userid });
        
        if (!user) {
            // Create new user if doesn't exist
            user = await Schemas.User.create({
                googleId: userid,
                name: payload.name || payload.given_name + ' ' + payload.family_name,
                email: payload.email,
                galleries: [],
                premium: false
            });
        }

        // Log the user in
        req.login(user, (err) => {
            if (err) {
                console.error('Login error:', err);
                return res.status(500).json({ 
                    error: 'Login failed',
                    details: err.message 
                });
            }
            return res.json({ 
                status: 'success', 
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email
                }
            });
        });
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ 
            error: 'Authentication failed', 
            details: error.message 
        });
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
};

const MAX_GALLERY_NUM = 5;
const MAX_GALLERY_SIZE = 10;

async function addToGalleries(artwork, current_user, gallery_id) {
    console.log(`Connecting to MongoDB`);
    await mongoose.connect(url);
    const db = mongoose.connection;
    db.on('error', console.error.bind(console, 'error: '));
    db.once('open', async function() {
        try {
            console.log(`✅ Connection successful with a readyState of: ${db.readyState}`);
            
            var currGallery = await addGalleryToDB(current_user, gallery_id);

            // add the art to the gallery
            if (currGallery != null) {
                await addArtToGallery(artwork, currGallery);
            }
        }
        catch(err) {
            console.log(`Error pushing artwork: ${err}`);
        }
        await db.close();
    });
    /* search for gallery index number */
    const targetId = gallery_id.toString();
    const index = current_user.galleries
                    .map(id => id.toString())
                    .indexOf(targetId);
    return index;
}

async function addGalleryToDB(current_user, gallery_id) {
    // find current gallery as obj
    try {
        let currGallery = await Schemas.Gallery.findOne({ '_id': gallery_id });
        if (currGallery === null) {
            console.log(`Gallery not found. Creating Gallery..`)
            currGallery = await Schemas.Gallery.create({ _id:gallery_id, artworks: [], user_id: current_user });
        } else {
            console.log(`Gallery found: ${gallery_id}`);
        }
        return currGallery;
    }
    catch (err) {
        console.log(`Error creating gallery: ${err}`);
    }
    return null;
}

async function addArtToGallery(artwork, galleryObj) {
    // search the gallery for the piece to add
    try {
        const exists = await Schemas.Gallery.findOne({ 
            _id: galleryObj._id,
            artworks: {
                $elemMatch: {
                    title: artwork.title
                }
            }
        });
        // push to artworks array if not found
        if (exists === null) {
            if (galleryObj.artworks.length === MAX_GALLERY_SIZE) {
                const out = "You have reached the maximum amount of artworks per gallery."
                console.log(out);
                alert(out);
            } else {
                await Schemas.Gallery.updateOne(
                    { _id:galleryObj._id }, { $push: { artworks: artwork } }
                );
                console.log(`Art added to gallery: ${galleryObj._id}`);
            }
        } else {
            console.log(`The artwork ${artwork.title} already exists in this gallery`);
        }
    } catch (err) {
        console.log(`Error searching for and pushing to gallery: ${err}`);
    }
}

// load homepage and css
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'homepage.html'));
});

// parse incoming json requests
app.use(express.json());

/****************************/
/*   for testing purposes   */
const user = "alee22";
const pw = "temp-password";

let Galleries = [];

for (let i=0; i<MAX_GALLERY_NUM; i++) {
    Galleries[i] = new mongoose.Types.ObjectId();
}

let current_user = new Schemas.User({ username:user, password:pw, galleries:Galleries, premium:false });

let selectedGalleryNum = 0;
const selectedGallery = Galleries[selectedGalleryNum];
/****************************/

// User information endpoint
app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        console.log('User data:', req.user);
        res.json({ 
            user: {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email
            }
        });
    } else {
        res.json({ user: null });
    }
});

// Protect the save-art endpoint
app.post('/api/save-art', isAuthenticated, async (req, res) => {
    const artwork = req.body;
    const current_user = req.user;

    // send success and saved artwork
    console.log(`Received artwork: ${artwork.title.toString()}`);

    // add current piece to selected gallery
    const galleryNum = await addToGalleries(artwork, current_user, selectedGallery) + 1;

    console.log(`Artwork added to Gallery Number ${galleryNum}`);

    res.json( { status: 'success', saved_gallery: galleryNum });
});