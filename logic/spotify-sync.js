const mongoose = require('mongoose')
const Spotify = require('./spotify')
const User = mongoose.model('User')
const UserArtist = mongoose.model('UserArtist')
const Artist = mongoose.model('Artist')
const RelatedArtist = mongoose.model('RelatedArtist')
const _ = require('lodash')

module.exports = {
  syncUserArtists,
  syncRelatedArtists,
  findOrCreateArtist,
}
/**
 * @param user object An authorized user object
 **/
async function syncUserArtists(user) {
  let accessToken = user.accessToken
  if (!accessToken) {
    const auth = await Spotify.getAccessToken(user.refreshToken)
    accessToken = auth.access_token
  }
  const topArtists = await Spotify.loadTopArtists(accessToken)
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

async function syncRelatedArtists(accessToken, artist) {
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
