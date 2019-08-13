const mongoose = require('mongoose')
mongoose.set('useCreateIndex', true)
mongoose.set('useFindAndModify', false)
require('./models/user')
require('./models/user-artist')

const express = require('express')
const app = express()

app.use(express.json())
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'content-type')
  next()
})

const mongoConnect = async (req, res, next) => {
  await mongoose.connect(process.env.DB_URI, {
    connectTimeoutMS: 5000,
    useNewUrlParser: true,
  })
  next()
}

const mongoDisconnect = async (req, res, next) => {
  await mongoose.disconnect()
  next()
}

app.use(mongoConnect)

require('./routes')(app)

if (process.env.NODE_ENV !== 'development') {
  app.use(mongoDisconnect)
}

module.exports = app
