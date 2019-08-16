#!/usr/bin/env node

require('..')
require('dotenv').config({})
const mongoose = require('mongoose')
const UserArtist = mongoose.model('UserArtist')
const Artist = mongoose.model('Artist')
const ParallelPromise = require('@jchancehud/parallel-promise')

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
  const promiseByName = {}
  const createOrLoadArtistByName = async (name, data) => {
    if (promiseByName[name]) return promiseByName[name]
    promiseByName[name] = Promise.resolve().then(async () => {
      const existingArtist = await Artist.findOne({
        name,
      }).exec()
      if (existingArtist) return existingArtist
      return await Artist.create(data)
    })
    return await promiseByName[name]
  }
  await ParallelPromise(userArtists.length, async (i) => {
    const userArtist = userArtists[i]
    console.log(`step ${i} of ${userArtists.length}`)
    if (userArtist.artistId) return
    const artist = createOrLoadArtistByName(userArtist.name, {
      genres: userArtist.genres,
      images: userArtist.images,
      name: userArtist.name,
      popularity: userArtist.popularity,
      followerCount: userArtist.followerCount,
    })
    await UserArtist.updateOne(
      {
        _id: userArtist._id,
      },
      {
        artistId: artist._id,
      }
    )
  })
})()
  .then(() => console.log('v2 migration completed, exiting'))
  .then(() => process.exit(0))
  .catch((err) => {
    console.log('Error in migration!', err)
    process.exit(1)
  })
