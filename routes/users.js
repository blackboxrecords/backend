const mongoose = require('mongoose')
const User = mongoose.model('User')
const UserArtist = mongoose.model('UserArtist')
const RelatedArtist = mongoose.model('RelatedArtist')
const _ = require('lodash')

module.exports = (app, final) => {
  app.get('/users', final(loadUsers))
  app.get('/users/artists', final(loadUserArtists))
  app.get('/users/artists/related', final(loadRelatedArtists))
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

const loadRelatedArtists = async (req, res) => {
  const users = await User.find({}).exec()
  const relatedArtists = await Promise.all(
    users.map(async (user) => {
      const artists = await _loadRelatedArtistsByUser(user._id)
      return artists.map((artist) => ({ ...artist, user }))
    })
  )
  const fields = [
    'Spotify Name',
    'Spotify Email',
    'Ranking',
    'Artist',
    'Related Artist',
    'Repeats',
    'Popularity',
    'Followers',
    'Genres',
  ]
  const sortedData = _.chain(relatedArtists)
    .flatten()
    .map((artist) => ({
      ...artist,
      user: artist.user,
    }))
    .map((relatedArtist) =>
      [
        relatedArtist.user.name,
        relatedArtist.user.email,
        relatedArtist.rootArtist.rank,
        relatedArtist.rootArtist.name,
        relatedArtist.name,
        relatedArtist.referenceCount,
        relatedArtist.popularity,
        relatedArtist.followerCount,
        (relatedArtist.genres || []).join(' '),
      ].join(',')
    )
    .value()
  sortedData.unshift(fields.join(','))
  const finalCSV = sortedData.join('\n')
  res.set('Content-Type', 'text/csv')
  res.set('Content-Disposition', 'attachment; filename="related-data.csv"')
  res.send(finalCSV)
}

const _loadRelatedArtistsByUser = async (userId) => {
  const userArtists = await UserArtist.find({
    ownerId: mongoose.Types.ObjectId(userId),
  })
    .populate(['artist'])
    .sort({ createdAt: -1 })
    .limit(15)
    .lean()
    .exec()
  const rankedArtistById = _.chain(userArtists)
    .map('artist')
    .map((artist, index) => ({
      ...artist,
      rank: index + 1,
    }))
    .keyBy((artist) => artist._id.toString())
    .value()
  const relatedArtists = await RelatedArtist.find({
    rootArtistId: {
      $in: userArtists.map((item) => item.artist._id),
    },
    relatedArtistId: {
      $nin: userArtists.map((item) => item.artist._id),
    },
  })
    .populate(['rootArtist', 'relatedArtist'])
    .lean()
    .exec()
  return _.chain(relatedArtists)
    .uniqBy((relatedArtist) => relatedArtist.relatedArtistId.toString())
    .slice(0, 50)
    .map((relatedArtist) => ({
      ...relatedArtist.relatedArtist,
      rootArtist:
        rankedArtistById[relatedArtist.rootArtist._id] ||
        relatedArtist.rootArtist,
      referenceCount: _.countBy(relatedArtists, (a) => a.relatedArtistId)[
        relatedArtist.relatedArtistId
      ],
    }))
    .value()
}
