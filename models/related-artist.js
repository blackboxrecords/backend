const mongoose = require('mongoose')

const RelatedArtistSchema = new mongoose.Schema({
  rootArtistId: {
    type: mongoose.Types.ObjectId,
    required: true,
  },
  relatedArtistId: {
    type: mongoose.Types.ObjectId,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
  },
})

RelatedArtistSchema.virtual('rootArtist', {
  ref: 'Artist',
  localField: 'rootArtistId',
  foreignField: '_id',
  justOne: true,
})

RelatedArtistSchema.virtual('relatedArtist', {
  ref: 'Artist',
  localField: 'relatedArtistId',
  foreignField: '_id',
  justOne: true,
})

mongoose.model('RelatedArtist', RelatedArtistSchema)
