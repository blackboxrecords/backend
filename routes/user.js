const mongoose = require('mongoose')
const User = mongoose.model('User')
const asyncExpress = require('async-express')

module.exports = (app) => {
  app.post('/users', createUser)
}

const createUser = asyncExpress(async (req, res) => {
  console.log(req.body)
  res.status(204).end()
})
