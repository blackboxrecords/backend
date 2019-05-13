const mongoose = require('mongoose')
const User = mongoose.model('User')
const asyncExpress = require('async-express')
const axios = require('axios')

const REDIRECT_URI = 'http://localhost:4000/auth'

module.exports = (app) => {
  app.get('/auth', authUser)
  app.get('/', testPage)
}

const authUser = asyncExpress(async (req, res) => {
  const code = req.query.code
  const clientID = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  try {
    const { data } = await axios.post('https://accounts.spotify.com/api/token', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientID,
      client_secret: clientSecret
    }, {
      'Content-Type': 'application/x-www-form-urlencoded',
      transformRequest: [(data, headers) => {
        return Object.entries(data).map(x => `${encodeURIComponent(x[0])}=${encodeURIComponent(x[1])}`).join('&')
      }]
    })
    console.log(data)
  } catch (err) {
    // Redirect to an error url
    console.log(err)
  }
  res.redirect(301, 'https://blackboxrecordclub.com/successful-connection')
})

const testPage = (req, res) => {
  const redirectURI = encodeURIComponent(REDIRECT_URI)
  const scopes = ['user-top-read', 'user-library-read', 'user-read-email'].join(' ')
  const clientID = process.env.SPOTIFY_CLIENT_ID
  res.send(`
  <html>
    <head>
      <title>Spotify Authentication</title>
    </head>
    <body>
      <a href="https://accounts.spotify.com/authorize?client_id=${clientID}&response_type=code&redirect_uri=${redirectURI}&scope=${scopes}&show_dialog=true">
        Link Account
      </a>
    </body>
  </html>
`)
}
