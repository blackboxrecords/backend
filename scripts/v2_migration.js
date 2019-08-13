#!/usr/bin/env node

require('..')
require('dotenv').config({})
const mongoose = require('mongoose')
const UserArtist = mongoose.model('UserArtist')
const Artist = mongoose.model('Artist')

try {
  ;(async () => {
    await mongoose.connect(process.env.DB_URI, {
      connectTimeoutMS: 5000,
      useNewUrlParser: true,
    })
    console.log('connected')
    const userArtists = await UserArtist.find({}).exec()
    for (const _artist of userArtists) {
      const existingArtist = await Artist.findOne({ name: _artist.name }).exec()
      if (existingArtist) {
        await UserArtist.findOneAndUpdate(
          {
            _id: mongoose.Types.ObjectId(_artist._id),
          },
          {
            artistId: existingArtist._id,
          }
        ).exec()
        continue
      }
      const artist = await Artist.create({
        name: _artist.name,
        popularity: _artist.popularity,
        genres: _artist.genres,
        followerCount: _artist.followerCount,
        images: _artist.images,
      })
      await UserArtist.findOneAndUpdate(
        {
          _id: mongoose.Types.ObjectId(_artist._id),
        },
        {
          artistId: artist._id,
        }
      )
    }
    process.exit()
  })()
} catch (err) {
  console.log('Error in migration!', err)
  process.exit(1)
}
