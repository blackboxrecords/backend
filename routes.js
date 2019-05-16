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
  app.get('/sync', loadUserArtists)
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
    await User.create({
      refreshToken: data.refresh_token,
      scope: data.scope,
    })
  } catch (err) {
    // Redirect to an error url
    console.log('Error authorizing', err)
  }
  res.redirect(301, 'https://blackboxrecordclub.com/successful-connection')
})

const loadUserArtists = asyncExpress(async (req, res) => {
  const { userId } = req.query
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
  res.status(204).end()
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
