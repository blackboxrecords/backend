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

mongoose.model('RelatedArtist', RelatedArtistSchema)
