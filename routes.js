const mongoose = require('mongoose')
const User = mongoose.model('User')
const UserArtist = mongoose.model('UserArtist')
const asyncExpress = require('async-express')
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

module.exports = (app) => {
  app.get('/auth', authUser)
  app.get('/', testPage)
  app.get('/sync', syncUserArtists)
  app.get('/users', loadUsers)
  app.get('/users/artists', loadUserArtists)
}

const loadUserArtists = asyncExpress(async (req, res) => {
  const userArtists = await UserArtist.find({})
    .populate('owner')
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
    .map((arr) => _.sortBy(arr, 'popularity'))
    .map((arr) => _.reverse(arr))
    .map((arr) =>
      _.map(arr, (userArtist, index) => ({
        ...userArtist,
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
        userArtist.genres.join(' '),
      ].join(',')
    )
    .value()
  sortedData.unshift(fields.join(','))
  const finalCSV = sortedData.join('\n')
  res.set('Content-Type', 'text/csv')
  res.set('Content-Disposition', 'attachment; filename="artist-data.csv"')
  res.send(finalCSV)
})

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

const authUser = asyncExpress(async (req, res) => {
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
      _syncUserArtists(existingUser._id)
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
    }).exec()
    _syncUserArtists(created._id)
  } catch (err) {
    // Redirect to an error url
    console.log('Error authorizing', err)
  }
  res.redirect(301, 'https://blackboxrecordclub.com/successful-connection')
})

const syncUserArtists = asyncExpress(async (req, res) => {
  const { userId } = req.query
  await _syncUserArtists(userId)
  res.status(204).end()
})

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
  await UserArtist.deleteMany({
    ownerId: mongoose.Types.ObjectId(user._id),
    name: {
      $in: _.map(items, 'name'),
    },
  }).exec()
  await UserArtist.create(
    _.map(items, (item) => ({
      ...item,
      followerCount: item.followers.total,
      ownerId: user._id,
    }))
  )
}

const loadUsers = asyncExpress(async (req, res) => {
  const users = await User.find({})
    .lean()
    .exec()
  res.json(
    _.map(users, (user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
    }))
  )
})

const testPage = (req, res) => {
  const redirectURI = encodeURIComponent(process.env.REDIRECT_URI)
  const scopes = ['user-top-read', 'user-library-read', 'user-read-email'].join(
    ' '
  )
  const clientID = process.env.SPOTIFY_CLIENT_ID
  res.send(`
  <html>
    <head>
      <title>Spotify Authentication</title>
    </head>
    <body>
      <a href="https://accounts.spotify.com/authorize?client_id=${clientID}&response_type=code&redirect_uri=${redirectURI}&scope=${scopes}&show_dialog=true">
        Link Account
      </a>
    </body>
  </html>
`)
}
