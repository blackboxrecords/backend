#!/usr/bin/env node

require('..')
require('dotenv').config({})
const mongoose = require('mongoose')
const UserArtist = mongoose.model('UserArtist')
const Artist = mongoose.model('Artist')

/**
 * Run this to get separate artist collection and simplified user/artist relation
 **/
;(async () => {
  await mongoose.connect(process.env.DB_URI, {
    connectTimeoutMS: 5000,
    useNewUrlParser: true,
  })
  console.log('connected')
  const userArtists = await UserArtist.find({}).exec()
  let count = 0
  for (const userArtist of userArtists) {
    console.log(`step ${++count} of ${userArtists.length}`)
    const existingArtist = await Artist.findOne({
      name: userArtist.name,
    }).exec()
    if (existingArtist) {
      await UserArtist.findOneAndUpdate(
        {
          _id: mongoose.Types.ObjectId(userArtist._id),
        },
        {
          artistId: existingArtist._id,
        }
      ).exec()
      continue
    }
    const artist = await Artist.create(userArtist)
    await UserArtist.findOneAndUpdate(
      {
        _id: mongoose.Types.ObjectId(userArtist._id),
      },
      {
        artistId: artist._id,
      }
    )
  }
  process.exit()
})()
  .then(() => console.log('v2 migration completed, exiting'))
  .catch((err) => {
    console.log('Error in migration!', err)
    process.exit(1)
  })
