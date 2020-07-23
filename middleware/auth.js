const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')

module.exports = (req, res, next) => {
  try {
    loadUser(req)
    if (!req.user) {
      res.status(401)
      res.json({ message: 'No authentication token in body or query' })
      res.end()
      return
    }
    if (!req.user._id) {
      throw new Error('No _id present on user')
    }
    next()
  } catch (err) {
    res.status(500)
    res.send(err.toString())
  }
}

function loadUser(req) {
  const token = req.body.token || req.query.token
  if (!token) return
  const user = jwt.verify(token, process.env.WEB_TOKEN_SECRET)
  if (user._id) {
    user._id = mongoose.Types.ObjectId(user._id)
  }
  req.user = user
}
