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

let connectingPromise
app.use(async (req, res, next) => {
  connectingPromise =
    connectingPromise ||
    (await mongoose.connect(process.env.DB_URI, {
      connectTimeoutMS: 5000,
      useNewUrlParser: true,
    }))
  await connectingPromise
  next()
})

// Wrapper function to do cleanup
const final = (fn) => async (...args) => {
  await Promise.resolve(fn(...args))
  if (process.env.NODE_ENV === 'development') return
  await mongoose.disconnect()
}

require('./routes/redirect')(app, final)
require('./routes/auth')(app, final)
require('./routes/users')(app, final)

module.exports = app
