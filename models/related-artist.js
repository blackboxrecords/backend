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
  updatedAt: {
    type: Date,
    required: false,
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

RelatedArtistSchema.index({ rootArtistId: -1, relatedArtistId: -1 })
RelatedArtistSchema.index({ rootArtistId: -1 })
RelatedArtistSchema.index({ relatedArtistId: -1 })
RelatedArtistSchema.index({ updatedAt: -1 })

mongoose.model('RelatedArtist', RelatedArtistSchema)
