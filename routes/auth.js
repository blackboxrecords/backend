const mongoose = require('mongoose')
const User = mongoose.model('User')
const UserArtist = mongoose.model('UserArtist')
const Artist = mongoose.model('Artist')
const RelatedArtist = mongoose.model('RelatedArtist')
const Spotify = require('../spotify-sync')
const _ = require('lodash')

module.exports = (app) => {
  app.get('/auth', authUser)
  app.get('/sync', syncUserArtists)
}

// A function to auto exchange a refresh token for a new access token
// Probably a good idea to always assume it's expired
const loadAuthedUser = async (userId) => {
  const user = await User.findOne({
    _id: mongoose.Types.ObjectId(userId),
  })
    .lean()
    .exec()
  if (!user) throw new Error('No user found for id', userId)
  const data = await Spotify.getAccessToken(user.refreshToken)
  return { ...user, accessToken: data.access_token }
}

const authUser = async (req, res) => {
  const { code } = req.query
  try {
    const data = await Spotify.initialAuth(code)
    const userData = await Spotify.loadProfile(data.access_token)
    const existingUser = await User.findOne({
      email: userData.email,
    }).exec()
    if (existingUser) {
      await _syncUserArtists(existingUser._id)
      return res.redirect(
        301,
        'https://blackboxrecordclub.com/successful-connection'
      )
    }
    const created = await User.create({
      refreshToken: data.refresh_token,
      scope: data.scope,
      email: userData.email,
      name: userData.display_name,
    })
    await _syncUserArtists(created._id)
  } catch (err) {
    // Redirect to an error url
    console.log('Error authorizing', err)
  }
  res.redirect(301, 'https://blackboxrecordclub.com/successful-connection')
}

const syncUserArtists = async (req, res) => {
  try {
    const { userId } = req.query
    await _syncUserArtists(userId)
    await User.findOneAndUpdate(
      {
        _id: mongoose.Types.ObjectId(userId),
      },
      {
        lastSynced: new Date(),
      }
    )
      .lean()
      .exec()
    const user = await User.findOne({ _id: mongoose.Types.ObjectId(userId) })
      .lean()
      .exec()
    res.json({
      ...user,
    })
  } catch (err) {
    console.log('Error syncing user artists', err)
    res.status(500).json({
      message: 'Error syncing user artists',
    })
  }
}

const _syncUserArtists = async (userId) => {
  const user = await loadAuthedUser(userId)
  const data = await Spotify.loadTopArtists(user.accessToken)
  const { items } = data
  // console.log(_.map(items, 'name').join(', '))
  const artists = await Artist.find({
    name: {
      $in: _.map(items, 'name'),
    },
  }).exec()
  await Promise.all(
    _.map(artists, async ({ _id, id, uri }) => {
      await Artist.updateOne(
        {
          _id,
        },
        {
          id,
          uri,
        }
      )
    })
  )
  await UserArtist.deleteMany({
    ownerId: mongoose.Types.ObjectId(user._id)
  }).exec()
  await Promise.all(
    items.map(async (item, index) => {
      await loadRelatedArtists(userId, item)
      const artist = await findOrCreateArtist(item)
      await UserArtist.create({
        ownerId: user._id,
        createdAt: new Date(),
        artistId: artist._id,
        rank: index,
      })
    })
  )
}

const loadRelatedArtists = async (userId, artistItem) => {
  const user = await loadAuthedUser(userId)
  const { artists } = await Spotify.loadRelatedArtists(
    user.accessToken,
    artistItem.id
  )
  const artist = await findOrCreateArtist(artistItem)
  const now = new Date()
  const promises = artists.map(async (item, index) => {
    const relatedArtist = await findOrCreateArtist(item)
    const existing = await RelatedArtist.findOne({
      rootArtistId: mongoose.Types.ObjectId(artist._id),
      relatedArtistId: mongoose.Types.ObjectId(relatedArtist._id),
    })
    if (existing) {
      await RelatedArtist.updateOne(
        {
          _id: existing._id,
        },
        {
          updatedAt: now,
        }
      )
      return existing
    }
    return await RelatedArtist.create({
      rootArtistId: mongoose.Types.ObjectId(artist._id),
      relatedArtistId: mongoose.Types.ObjectId(relatedArtist._id),
      createdAt: new Date(+now - index),
      updatedAt: new Date(+now - index),
    })
  })
  return await Promise.all(promises)
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
