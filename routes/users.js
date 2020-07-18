const mongoose = require('mongoose')
const User = mongoose.model('User')
const UserArtist = mongoose.model('UserArtist')
const RelatedArtist = mongoose.model('RelatedArtist')
const _ = require('lodash')

module.exports = (app) => {
  app.get('/users', loadUsers)
  app.get('/users/artists', loadUserArtists)
  app.get('/users/artists/related', loadRelatedArtists)
  app.get('/users/genres', loadUserGenres)
  app.delete('/users/:id', deleteUser)
}

async function deleteUser(req, res) {
  const { id } = req.params
  const _id = mongoose.Types.ObjectId(id)
  await UserArtist.deleteMany({
    ownerId: _id,
  }).exec()
  const r = await User.deleteOne({
    _id,
  }).exec()
  res.status(204).end()
}

async function loadUsers(req, res) {
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
      hasToken: user.refreshToken !== null,
    }))
  )
}

async function loadUserGenres(req, res) {
  const userArtists = (await UserArtist.find({}))
  const users = await User.find({})
    .exec()
  const genresByUserId = {}
  await Promise.all(users.map(async (user) => {
    genresByUserId[user._id] = await genresForUser(user)
  }))
  const fields = [
    'Spotify Name',
    'Spotify Email',
    'Genres',
  ]
  const csv = _.chain(users)
    .map((user) => [
      user.name,
      user.email,
      genresByUserId[user._id]
    ])
    .map((arr) => arr.join(','))
    .reverse()
    .concat(fields.join(','))
    .reverse()
    .join('\n')
    .value()
  res.set('Content-Type', 'text/csv')
  res.set('Content-Disposition', 'attachment; filename="user-genres.csv"')
  res.send(csv)
}

const genresForUser = async (user) => {
  const userArtists = await UserArtist.find({
    ownerId: mongoose.Types.ObjectId(user._id),
  })
    .sort({ rank: 1 })
    .populate(['artist'])
    .lean()
    .exec()
  const artists = _.chain(userArtists)
    .map('artist')
    .compact()
    .value()
  const sortedGenres = _.chain(artists)
    .map('genres')
    .flatten()
    .compact()
    .countBy()
    .map((count, genre) => ({
      count,
      genre
    }))
    .sortBy('count')
    .reverse()
    .map('genre')
    .value()
  return sortedGenres
}

async function loadUserArtists(req, res) {
  const userArtists = (await UserArtist.find({})
    .sort({ rank: 1 })
    .populate(['artist', 'owner'])
    .lean()
    .exec()).filter((obj) => !!obj.artist)
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
        ...(userArtist.genres || []),
      ].join(',')
    )
    .value()
  sortedData.unshift(fields.join(','))
  const finalCSV = sortedData.join('\n')
  res.set('Content-Type', 'text/csv')
  res.set('Content-Disposition', 'attachment; filename="artist-data.csv"')
  res.send(finalCSV)
}

async function loadRelatedArtists(req, res) {
  const users = await User.find({}).exec()
  const relatedArtists = []
  for (const user of users) {
    const artists = await _loadRelatedArtistsByUser(user._id)
    relatedArtists.push(artists.map((artist) => ({ ...artist, user })))
  }
  // const relatedArtists = await Promise.all(
  //   users.map(async (user) => {
  //     const artists = await _loadRelatedArtistsByUser(user._id)
  //     return artists.map((artist) => ({ ...artist, user }))
  //   })
  // )
  const fields = [
    'Spotify Name',
    'Spotify Email',
    'Artist Rank(s)',
    'Artist(s)',
    'Related Artist',
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
        `"${_.map(relatedArtist.rootArtists, 'rank').join()}"`,
        `"${_.map(relatedArtist.rootArtists, 'name').join()}"`,
        `"${relatedArtist.name.replace('"', '""""')}"`,
        relatedArtist.popularity,
        relatedArtist.followerCount,
        ...(relatedArtist.genres || []),
      ].join()
    )
    .value()
  sortedData.unshift(fields.join())
  const finalCSV = sortedData.join('\n')
  res.set('Content-Type', 'text/csv')
  res.set('Content-Disposition', 'attachment; filename="related-data.csv"')
  res.send(finalCSV)
}

const _loadRelatedArtistsByUser = async (userId) => {
  const userArtists = (await UserArtist.find({
    ownerId: mongoose.Types.ObjectId(userId),
  })
    .populate(['artist'])
    .sort({ rank: 1 })
    .limit(25)
    .lean()
    .exec()).filter((obj) => !!obj.artist)
  const rankedArtistById = _.chain(userArtists)
    .map((userArtist) => ({
      ...userArtist.artist,
      rank: userArtist.rank,
    }))
    .keyBy((artist) => (artist._id || '').toString())
    .value()
  const _ids = userArtists.map((item) => item.artist._id)
  const relatedArtists = await RelatedArtist.find({
    rootArtistId: {
      $in: _ids,
    },
    relatedArtistId: {
      $nin: _ids,
    },
  })
    .sort({ updatedAt: -1 })
    .populate(['rootArtist', 'relatedArtist'])
    .lean()
    .exec()
  const groupedRootArtists = _.chain(relatedArtists)
    .map((_relatedArtist) => ({
      ..._relatedArtist,
      rootArtist:
        rankedArtistById[_relatedArtist.rootArtistId.toString()] ||
        _relatedArtist,
    }))
    .groupBy('relatedArtistId')
    .forEach((_relatedArtists, id, obj) =>
      Object.assign(obj, {
        [id]: _.chain(_relatedArtists)
          .map('rootArtist')
          .sortBy(['rank'])
          .value(),
      })
    )
    .value()
  return _.chain(relatedArtists)
    .uniqBy('relatedArtist._id')
    .slice(0, 50)
    .map((relatedArtist) => ({
      ...relatedArtist.relatedArtist,
      rootArtists: groupedRootArtists[relatedArtist.relatedArtistId],
      rootArtist:
        rankedArtistById[relatedArtist.rootArtist._id] ||
        relatedArtist.rootArtist,
    }))
    .value()
}
