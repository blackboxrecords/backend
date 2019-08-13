const mongoose = require('mongoose')

const ImageSchema = new mongoose.Schema({
  height: {
    type: Number,
    required: true,
  },
  width: {
    type: Number,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
})

const UserArtistSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Types.ObjectId,
    required: true,
  },
  images: {
    type: [ImageSchema],
    required: false,
  },
  name: {
    type: String,
    required: false,
  },
  popularity: {
    type: Number,
    required: false,
  },
  genres: {
    type: [String],
    required: false,
  },
  followerCount: {
    type: Number,
    required: false,
  },
  createdAt: {
    type: Date,
    required: true,
  },
  artistId: {
    type: mongoose.Types.ObjectId,
    required: true,
  },
})

UserArtistSchema.virtual('owner', {
  ref: 'User',
  localField: 'ownerId',
  foreignField: '_id',
  justOne: true,
})

UserArtistSchema.virtual('artist', {
  ref: 'Artist',
  localField: 'artistId',
  foreignField: '_id',
  justOne: true,
})

UserArtistSchema.index({ ownerId: 1, name: 1 })
UserArtistSchema.index({ createdAt: -1 })

mongoose.model('UserArtist', UserArtistSchema)
