/** Enters from "npm run daemon", see package.json **/

const mongoose = require('mongoose')
mongoose.set('useCreateIndex', true)
mongoose.set('useFindAndModify', false)
require('../models/user')
require('../models/user-artist')
require('../models/artist')
require('../models/related-artist')

const Spotify = require('../logic/spotify')
const SpotifySync = require('../logic/spotify-sync')
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
      console.log()
      console.log(`Sync beginning at [${start.toISOString()}]`)
      await sync()
      console.log(`Sync finished in ${+((new Date()) - +start) / 1000} seconds`)
    } catch (err) {
      console.log()
      console.log(err)
      if (failures++ >= 5) {
        console.log()
        console.log('5 consecutive failures, exiting')
        process.exit(1)
      }
      console.log(`Uncaught error from sync function, resetting (${failures} of 5)`)
      await new Promise(r => setTimeout(r, 5000))
      continue
    }
    const now = new Date()
    console.log()
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
  console.log()
  console.log(`Updating ${users.length} users...`)
  let i = 0
  let lastPrint = 0
  for (const user of users) {
    i += 1
    if (+(new Date()) - lastPrint > 30 * 1000) {
      lastPrint = new Date()
      printPercent(i, users.length)
    }
    if (i > 10) break
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
        console.log()
        console.log(`Error authing for ${user.email}`, err)
        console.log()
        throw err
      }
    }
    const { artists } = await SpotifySync.syncUserArtists(user)
    usersToUpdate.push(user)
    _artistsToUpdate.push(...artists)
  }
  const artistsToUpdate = _.uniqBy(_artistsToUpdate, 'name')
  console.log()
  console.log(`Updating ${artistsToUpdate.length} artist-artist relations`)
  const serverAuth = await Spotify.getAccessToken()
  i = lastPrint = 0
  for (const _artist of artistsToUpdate) {
    i += 1
    if (+(new Date()) - lastPrint > 30 * 1000) {
      lastPrint = new Date()
      printPercent(i, artistsToUpdate.length)
    }
    const artist = await SpotifySync.findOrCreateArtist(_artist)
    // Clear the artist relations and recalculate
    await SpotifySync.syncRelatedArtists(serverAuth.access_token, artist)
  }
}
