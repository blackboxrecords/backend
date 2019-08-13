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
  app.get('/users', final(loadUsers))
  app.get('/users/artists', final(loadUserArtists))
  app.get('/users/artists/unheard', final(loadUnheardArtists))
  app.get('/spotify/auth', final(authRedirect))
}

const loadUserArtists = async (req, res) => {
  const userArtists = await UserArtist.find({})
    .sort({ createdAt: -1 })
    .populate(['artist', 'owner'])
    .lean()
    .exec()
  const fields = [
    'Spotify Name',
    'Spotify Email',
    'Ranking',
    'Artist',
    'Popularity',
    'Followers',
    'Genres',
  ]
  const sortedData = _.chain(userArtists)
    .groupBy('owner.email')
    .map((arr) =>
      _.map(arr, (userArtist, index) => ({
        ...userArtist.artist,
        owner: userArtist.owner,
        index: index + 1,
      }))
    )
    .reduce((acc, arr) => _.concat(acc, arr), [])
    .map((userArtist) =>
      [
        userArtist.owner.name,
        userArtist.owner.email,
        userArtist.index,
        userArtist.name,
        userArtist.popularity,
        userArtist.followerCount,
        (userArtist.genres || []).join(' '),
      ].join(',')
    )
    .value()
  sortedData.unshift(fields.join(','))
  const finalCSV = sortedData.join('\n')
  res.set('Content-Type', 'text/csv')
  res.set('Content-Disposition', 'attachment; filename="artist-data.csv"')
  res.send(finalCSV)
}

const loadUnheardArtistsByUser = async (userId) => {
  const userArtists = await UserArtist.find({
    ownerId: mongoose.Types.ObjectId(userId),
  })
    .populate(['owner', 'artist'])
    .sort({ createdAt: -1 })
    .exec()
  const relatedArtists = await RelatedArtist.find({
    rootArtistId: {
      $in: userArtists.map((item) => item.artist._id),
    },
    relatedArtistId: {
      $nin: userArtists.map((item) => item.artist._id),
    },
  })
    .limit(50)
    .exec()
  return Artist.find({
    _id: {
      $in: _.map(relatedArtists, 'relatedArtistId'),
    },
  })
    .lean()
    .exec()
}

const loadUnheardArtists = async (req, res) => {
  const users = await User.find({}).exec()
  const relatedArtists = await Promise.all(
    users.map(async (user) => {
      const artists = await loadUnheardArtistsByUser(user._id)
      return artists.map((artist) => ({ ...artist, user }))
    })
  )
  const fields = [
    'Spotify Name',
    'Spotify Email',
    'Ranking',
    'Unheard Artist',
    'Popularity',
    'Followers',
    'Genres',
  ]
  const sortedData = _.chain(relatedArtists)
    .map((arr) =>
      _.map(arr, (artist, index) => ({
        ...artist,
        user: artist.user,
        index: index + 1,
      }))
    )
    .flatten()
    .map((userArtist) =>
      [
        userArtist.user.name,
        userArtist.user.email,
        userArtist.index,
        userArtist.name,
        userArtist.popularity,
        userArtist.followerCount,
        (userArtist.genres || []).join(' '),
      ].join(',')
    )
    .value()
  sortedData.unshift(fields.join(','))
  const finalCSV = sortedData.join('\n')
  res.set('Content-Type', 'text/csv')
  res.set('Content-Disposition', 'attachment; filename="unheard-data.csv"')
  res.send(finalCSV)
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
  const { data } = await axios.post(
    'https://accounts.spotify.com/api/token',
    {
      grant_type: 'refresh_token',
      refresh_token: user.refreshToken,
    },
    {
      transformRequest: [URITransform],
    }
  )
  return { ...user, accessToken: data.access_token }
}

const authUser = async (req, res) => {
  const { code } = req.query
  try {
    const { data } = await axios.post(
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
    const { data: userData } = await axios.get(
      'https://api.spotify.com/v1/me',
      {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
        },
      }
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
  res.status(204).end()
}

const _syncUserArtists = async (userId) => {
  const user = await loadAuthedUser(userId)
  const { data } = await axios.get(
    'https://api.spotify.com/v1/me/top/artists',
    {
      params: {
        limit: 50,
      },
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
      },
    }
  )
  const { items } = data
  const artists = await Artist.find({
    name: {
      $in: _.map(items, 'name'),
    },
  }).exec()
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
        createdAt: new Date(+now + index),
        artistId: artist._id,
      })
    })
  )
}

const loadRelatedArtists = async (userId, artistItem) => {
  const user = await loadAuthedUser(userId)
  const {
    data: { artists },
  } = await axios.get(
    `https://api.spotify.com/v1/artists/${artistItem.id}/related-artists`,
    {
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
      },
    }
  )
  const artist = await findOrCreateArtist(artistItem)
  const promises = artists.map(async (item) => {
    const relatedArtist = await findOrCreateArtist(item)
    const existing = await RelatedArtist.findOne({
      rootArtistId: mongoose.Types.ObjectId(artist._id),
      relatedArtistId: mongoose.Types.ObjectId(relatedArtist._id),
    })
    if (existing) return existing
    return await RelatedArtist.create({
      rootArtistId: mongoose.Types.ObjectId(artist._id),
      relatedArtistId: mongoose.Types.ObjectId(relatedArtist._id),
      createdAt: new Date(),
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

const loadUsers = async (req, res) => {
  if (req.query.id) {
    const user = await User.findOne({
      _id: mongoose.Types.ObjectId(req.query.id),
    }).exec()
    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      lastSynced: user.lastSynced,
    })
  }
  const users = await User.find({})
    .lean()
    .exec()
  res.json(
    _.map(users, (user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      lastSynced: user.lastSynced,
    }))
  )
}

const authRedirect = async (req, res) => {
  const redirectURI = encodeURIComponent(process.env.REDIRECT_URI)
  const scopes = ['user-top-read', 'user-library-read', 'user-read-email'].join(
    ' '
  )
  const clientID = process.env.SPOTIFY_CLIENT_ID
  const url = `https://accounts.spotify.com/authorize?client_id=${clientID}&response_type=code&redirect_uri=${redirectURI}&scope=${scopes}&show_dialog=true`
  res.redirect(url)
}
