const mongoose = require('mongoose')
mongoose.set('useCreateIndex', true)
mongoose.set('useFindAndModify', false)
require('./models/user')
require('./models/user-artist')
require('./models/artist')
require('./models/related-artist')
require('./models/user-auth')
require('./models/token')

const express = require('express')
const app = express()

app.use(express.json())
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'POST, PUT, GET, OPTIONS, DELETE')
  res.set('Access-Control-Allow-Headers', 'content-type')
  next()
})

let mongoConnected = false

app.use(async (req, res, next) => {
  if (mongoConnected) {
    return next()
  }
  await mongoose.connect(process.env.DB_URI, {
    connectTimeoutMS: 5000,
    useNewUrlParser: true,
  })
  mongoConnected = true
  next()
})

require('./routes/redirect')(app)
require('./routes/auth')(app)
require('./routes/users')(app)
require('./routes/user-auth')(app)

app.get('/ping', (req, res) => res.send('pong'))

// Token creation
// ;(async () => {
//   await mongoose.connect(process.env.DB_URI, {
//     connectTimeoutMS: 5000,
//     useNewUrlParser: true,
//   })
//   const Token = mongoose.model('Token')
//   await Token.create({
//     token: 'pymF4SekmuJqJCItoaze92ETX025365RQJoJFas9',
//   })
// })()

module.exports = app
