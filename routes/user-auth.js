const mongoose = require('mongoose')
const UserAuth = mongoose.model('UserAuth')
const Token = mongoose.model('Token')
const auth = require('../middleware/auth')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

module.exports = (app) => {
  app.post('/users', createUser)
  app.put('/users/login', loginUser)
}

async function createUser(req, res) {
  const { username, password, ctoken } = req.body
  const count = await Token.count({ token: ctoken })
  if (count === 0) {
    res.status(401).json({ message: 'Invalid auth token' })
    return
  }
  await Token.deleteOne({ token: ctoken })
  if (!username) {
    res.status(400).json({ message: 'No username found in request' })
    return
  }
  if (username.length < 4) {
    res.status(400).json({ message: 'Username must be at least 4 characters' })
    return
  }
  if (!password) {
    res.status(400).json({ message: 'No password found in request' })
    return
  }
  if (password.length < 7) {
    res.status(400).json({ message: 'Password should be at least 7 characters' })
    return
  }
  const existing = await UserAuth.findOne({ username }).exec()
  if (existing) {
    res.status(422)
    res.json({ message: 'Username already exists' })
    return
  }
  const salt = await bcrypt.genSalt(10)
  const passwordHash = await bcrypt.hash(password, salt)
  const { _doc } = await UserAuth.create({
    username,
    passwordHash,
    createdAt: new Date(),
  })
  const token = jwt.sign({
    ..._doc, passwordHash: ''
  }, process.env.WEB_TOKEN_SECRET)
  res.json({
    ..._doc,
    passwordHash: '',
    token
  })

}

async function loginUser(req, res) {
  const { username, password } = req.body
  if (!username) {
    res.status(400).json({ message: 'No username found in request' })
    return
  }
  const user = await UserAuth.findOne({ username }).lean().exec()
  if (!user) {
    res.status(404).json({ message: `Username "${username}" not found` })
    return
  }
  const passwordMatch = await bcrypt.compare(password, user.passwordHash)
  if (!passwordMatch) {
    res.status(401).json({
      message: 'Your password is incorrect'
    })
    return
  }
  const token = jwt.sign({
    ...user,
    passwordHash: '',
  }, process.env.WEB_TOKEN_SECRET)
  res.json({
    ...user,
    passwordHash: '',
    token,
  })
}
