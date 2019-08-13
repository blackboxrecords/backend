const mongoose = require('mongoose')
mongoose.set('useCreateIndex', true)
mongoose.set('useFindAndModify', false)
require('./models/user')
require('./models/user-artist')
require('./models/artist')
require('./models/related-artist')

const express = require('express')
const app = express()

app.use(express.json())
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'content-type')
  next()
})

app.use(async (req, res, next) => {
  await mongoose.connect(process.env.DB_URI, {
    connectTimeoutMS: 5000,
    useNewUrlParser: true,
  })
  next()
})

// Wrapper function to do cleanup
const final = (fn) => async (...args) => {
  await Promise.resolve(fn(...args))
  await mongoose.disconnect()
}

require('./routes')(app, final)

module.exports = app
