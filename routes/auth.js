const mongoose = require('mongoose')
const User = mongoose.model('User')
const UserArtist = mongoose.model('UserArtist')
const Artist = mongoose.model('Artist')
const RelatedArtist = mongoose.model('RelatedArtist')
const Spotify = require('../logic/spotify')
const SpotifySync = require('../logic/spotify-sync')
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
      await SpotifySync.syncUserArtists(existingUser)
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
    await SpotifySync.syncUserArtists(created)
  } catch (err) {
    // Redirect to an error url
    console.log('Error authorizing', err)
  }
  res.redirect(301, 'https://blackboxrecordclub.com/successful-connection')
}

const syncUserArtists = async (req, res) => {
  try {
    const { userId } = req.query
    const user = await User.findOne({
      _id: mongoose.Types.ObjectId(userId)
    })
      .lean()
      .exec()
    await SpotifySync.syncUserArtists(user)
    const updatedUser = await User.findOne({
      _id: mongoose.Types.ObjectId(userId)
    })
      .lean()
      .exec()
    res.json(updatedUser)
  } catch (err) {
    console.log('Error syncing user artists', err)
    res.status(500).json({
      message: 'Error syncing user artists',
    })
  }
}
