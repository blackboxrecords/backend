const mongoose = require('mongoose')
const User = mongoose.model('User')
const UserArtist = mongoose.model('UserArtist')
const Artist = mongoose.model('Artist')
const RelatedArtist = mongoose.model('RelatedArtist')
const axios = require('axios')
const _ = require('lodash')

axios.defaults.headers.post['Content-Type'] =
  'application/x-www-form-urlencoded'
const AuthString = `${process.env.SPOTIFY_CLIENT_ID}:${
  process.env.SPOTIFY_CLIENT_SECRET
}`
axios.defaults.headers.post.Authorization = `Basic ${Buffer.from(
  AuthString
).toString('base64')}`
const URITransform = (data) =>
  Object.entries(data)
    .map((x) => `${encodeURIComponent(x[0])}=${encodeURIComponent(x[1])}`)
    .join('&')

module.exports = (app, final) => {
  app.get('/auth', final(authUser))
  app.get('/sync', final(syncUserArtists))
}

const guardedSpotifyLoad = async (fn) => {
  try {
    return await fn()
  } catch (err) {
    if (_.get(err, 'response.status') !== 429) throw err
    const retryInterval = _.get(err, 'response.headers.retry-after', 2)
    await new Promise((r) => setTimeout(r, (retryInterval + 5) * 1000))
    return await fn()
  }
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
  const { data } = await guardedSpotifyLoad(() =>
    axios.post(
      'https://accounts.spotify.com/api/token',
      {
        grant_type: 'refresh_token',
        refresh_token: user.refreshToken,
      },
      {
        transformRequest: [URITransform],
      }
    )
  )
  return { ...user, accessToken: data.access_token }
}

const authUser = async (req, res) => {
  const { code } = req.query
  try {
    const { data } = await guardedSpotifyLoad(() =>
      axios.post(
        'https://accounts.spotify.com/api/token',
        {
          code,
          grant_type: 'authorization_code',
          redirect_uri: process.env.REDIRECT_URI,
        },
        {
          transformRequest: [URITransform],
        }
      )
    )
    const { data: userData } = await guardedSpotifyLoad(() =>
      axios.get('https://api.spotify.com/v1/me', {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
        },
      })
    )
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
  const { data } = await guardedSpotifyLoad(() =>
    axios.get('https://api.spotify.com/v1/me/top/artists', {
      params: {
        limit: 50,
      },
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
      },
    })
  )
  const { items } = data
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
    ownerId: mongoose.Types.ObjectId(user._id),
    artistId: {
      $in: _.map(artists, '_id'),
    },
  }).exec()
  const now = new Date()
  await Promise.all(
    items.map(async (item, index) => {
      await loadRelatedArtists(userId, item)
      const artist = await findOrCreateArtist(item)
      await UserArtist.create({
        ownerId: user._id,
        createdAt: new Date(+now - index),
        artistId: artist._id,
      })
    })
  )
}

const loadRelatedArtists = async (userId, artistItem) => {
  const user = await loadAuthedUser(userId)
  const {
    data: { artists },
  } = await guardedSpotifyLoad(() =>
    axios.get(
      `https://api.spotify.com/v1/artists/${artistItem.id}/related-artists`,
      {
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
        },
      }
    )
  )
  const artist = await findOrCreateArtist(artistItem)
  const now = new Date()
  const promises = artists.map(async (item, index) => {
    const relatedArtist = await findOrCreateArtist(item)
    const existing = await RelatedArtist.findOne({
      rootArtistId: mongoose.Types.ObjectId(artist._id),
      relatedArtistId: mongoose.Types.ObjectId(relatedArtist._id),
    })
    if (existing) return existing
    return await RelatedArtist.create({
      rootArtistId: mongoose.Types.ObjectId(artist._id),
      relatedArtistId: mongoose.Types.ObjectId(relatedArtist._id),
      createdAt: new Date(+now - index),
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
    followerCount: artist.followers.total,
  })
}
