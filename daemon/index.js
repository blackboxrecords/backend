/** Enters from "npm run daemon", see package.json **/

const mongoose = require('mongoose')
mongoose.set('useCreateIndex', true)
mongoose.set('useFindAndModify', false)
require('../models/user')
require('../models/user-artist')
require('../models/artist')
require('../models/related-artist')

const Spotify = require('../spotify-sync')
const _ = require('lodash')

const User = mongoose.model('User')
const UserArtist = mongoose.model('UserArtist')
const Artist = mongoose.model('Artist')
const RelatedArtist = mongoose.model('RelatedArtist')

// Daemon
;(async () => {
  await mongoose.connect(process.env.DB_URI, {
    connectTimeoutMS: 5000,
    useNewUrlParser: true,
  })
  const syncInterval = 24 * 60 * 60 * 1000
  let failures = 0
  for (;;) {
    try {
      const start = new Date()
      console.log(`Sync beginning at [${start.toISOString()}]`)
      console.log()
      await sync()
      console.log(`Sync finished in ${+((new Date()) - +start) / 1000} seconds`)
    } catch (err) {
      console.log(err)
      if (failures++ >= 5) {
        console.log('5 consecutive failures, exiting')
        process.exit(1)
      }
      console.log('Uncaught error from sync function, resetting...')
      await new Promise(r => setTimeout(r, 5000))
      continue
    }
    const now = new Date()
    console.log(`Next sync at approximately [${new Date(+now + syncInterval).toISOString()}]`)
    console.log()
    await new Promise(r => setTimeout(r, syncInterval))
  }
})()

function printPercent(index, length) {
  const percent = index / length * 100
  console.log(`[${(new Date()).toISOString()}] ${Math.floor(percent)}% complete`)
}

/**
 * Sync function, updates user artists
 **/
async function sync() {
  const users = await User.find({})
  const _artistsToUpdate = []
  const usersToUpdate = []
  console.log(`Updating ${users.length} users...`)
  console.log()
  let i = 0
  let lastPrint = 0
  for (const user of users) {
    i += 1
    if (+(new Date()) - lastPrint > 30 * 1000) {
      lastPrint = new Date()
      printPercent(i, users.length)
    }
    // Sync the user or skip
    try {
      if (!user.refreshToken) continue
      const auth = await Spotify.getAccessToken(user.refreshToken)
      user.accessToken = auth.access_token
    } catch (err) {
      if (_.get(err, 'response.data.error') === 'invalid_grant') {
        await User.updateOne({
          _id: mongoose.Types.ObjectId(user._id),
        }, {
          refreshToken: null
        })
        user.refreshToken = null
        continue
      } else {
        console.log(`Error authing for ${user.email}`, err)
        throw err
      }
    }
    const { artists } = await syncArtistsForUser(user)
    usersToUpdate.push(user)
    _artistsToUpdate.push(...artists)
  }
  const artistsToUpdate = _.uniqBy(_artistsToUpdate, 'name')
  console.log(`Updating ${artistsToUpdate.length} artist-artist relations`)
  console.log()
  const serverAuth = await Spotify.getAccessToken()
  i = lastPrint = 0
  for (const _artist of artistsToUpdate) {
    i += 1
    if (+(new Date()) - lastPrint > 30 * 1000) {
      lastPrint = new Date()
      printPercent(i, artistsToUpdate.length)
    }
    const artist = await findOrCreateArtist(_artist)
    // Clear the artist relations and recalculate
    await updateArtist(serverAuth.access_token, artist)
  }
}

/**
 * @param user object An authorized user object
 **/
async function syncArtistsForUser(user) {
  const topArtists = await Spotify.loadTopArtists(user.accessToken)
  const { items } = topArtists
  const artists = []
  await Promise.all(_.map(items, async (_artist) => {
    const artist = await findOrCreateArtist(_artist)
    artists.push(artist)
    return await Artist.updateOne({
      _id: artist._id
    }, {
      artistId: _artist.id,
      uri: _artist.uri,
    })
  }))
  await User.findOneAndUpdate({
    _id: mongoose.Types.ObjectId(user._id),
  }, {
    lastSynced: new Date(),
  }).exec()
  await UserArtist.deleteMany({
    ownerId: mongoose.Types.ObjectId(user._id)
  }).exec()
  await Promise.all(artists.map(async (artist, index) => {
    await UserArtist.create({
      ownerId: user._id,
      createdAt: new Date(),
      artistId: artist._id,
      rank: index + 1,
    })
  }))
  return { artists: items }
}

async function updateArtist(accessToken, artist) {
  const { artists } = await Spotify.loadRelatedArtists(accessToken, artist.artistId)
  // Do these operations in parallel, there's no spotify API interaction
  let now = new Date()
  await Promise.all(artists.map(async (_relatedArtist, index) => {
    const relatedArtist = await findOrCreateArtist(_relatedArtist)
    const existing = await RelatedArtist.findOne({
      rootArtistId: mongoose.Types.ObjectId(artist._id),
      relatedArtistId: mongoose.Types.ObjectId(relatedArtist._id),
    }).exec()
    if (existing) {
      await RelatedArtist.updateOne({
        _id: existing._id,
      }, {
        updatedAt: new Date()
      })
      return
    }
    await RelatedArtist.create({
      rootArtistId: mongoose.Types.ObjectId(artist._id),
      relatedArtistId: mongoose.Types.ObjectId(relatedArtist._id),
      createdAt: new Date(+now - index),
      updatedAt: new Date(+now - index),
    })
  }))
}

async function findOrCreateArtist(artist) {
  const existing = await Artist.findOne({
    name: artist.name,
  }).exec()
  if (existing) return existing
  return await Artist.create({
    ...artist,
    artistId: artist.id,
    followerCount: artist.followers.total,
  })
}
