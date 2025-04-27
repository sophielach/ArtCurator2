const mongoose = require('mongoose');

const ArtworkSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            unique: false,
            required: true
        },
        artist_title: {
            type: String,
            unique: false,
            required: true
        },
        date_display: {
            type: String,
            unique: false,
            required: true
        },
        artist_display: {
            type: String,
            unique: false,
            required: true
        },
        classification_titles: {
            type: [String],
            unique: false,
            required: true
        },
        image_id: {
            type: String,
            unique: false,
            required: true
        }
    },
    { _id: false }
);
ArtworkSchema.methods.getImageUrl = function() { return `https://www.artic.edu/iiif/2/${this.image_id}/full/400,/0/default.jpg` };

const GallerySchema = new mongoose.Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId
        },
        artworks: {
            type: [ArtworkSchema],
            required: false,
            unique: false
        },
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            unique: false,
            required: true
        }
    },
);

const UserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            unique: true,
            required: true
        },
        password: {
            type: String,
            unique: false,
            required: false
        },
        googleId: {
            type: String,
            unique: true,
            sparse: true
        },
        email: {
            type: String,
            unique: true,
            sparse: true
        },
        galleries: {
            type: [mongoose.Schema.Types.ObjectId],
            unique: false,
            required: true
        },
        premium: {
            type: Boolean,
            required: true
        }
    }
)

const User = mongoose.model('User', UserSchema);
const Gallery = mongoose.model('Gallery', GallerySchema);

module.exports = { User, Gallery };
