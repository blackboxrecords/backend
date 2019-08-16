const mongoose = require('mongoose')

const UserArtistSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Types.ObjectId,
    required: true,
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
UserArtistSchema.index({ createdAt: -1, artistId: -1 })

mongoose.model('UserArtist', UserArtistSchema)
