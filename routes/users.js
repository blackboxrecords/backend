const mongoose = require('mongoose')
const User = mongoose.model('User')
const UserArtist = mongoose.model('UserArtist')
const Artist = mongoose.model('Artist')
const RelatedArtist = mongoose.model('RelatedArtist')
const _ = require('lodash')

module.exports = (app, final) => {
  app.get('/users', final(loadUsers))
  app.get('/users/artists', final(loadUserArtists))
  app.get('/users/artists/unheard', final(loadUnheardArtists))
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

const loadUnheardArtists = async (req, res) => {
  const users = await User.find({}).exec()
  const relatedArtists = await Promise.all(
    users.map(async (user) => {
      const artists = await _loadUnheardArtistsByUser(user._id)
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

const _loadUnheardArtistsByUser = async (userId) => {
  const userArtists = await UserArtist.find({
    ownerId: mongoose.Types.ObjectId(userId),
  })
    .populate(['owner', 'artist'])
    .sort({ createdAt: -1 })
    .limit(15)
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
