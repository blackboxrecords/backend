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
    default: [],
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  popularity: {
    type: Number,
    required: true,
  },
  genres: {
    type: [String],
    default: [],
    required: true,
  },
  followerCount: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
  },
})

UserArtistSchema.virtual('owner', {
  ref: 'User',
  localField: 'ownerId',
  foreignField: '_id',
  justOne: true,
})

UserArtistSchema.index({ ownerId: 1, name: 1 })
UserArtistSchema.index({ createdAt: -1 })

mongoose.model('UserArtist', UserArtistSchema)
