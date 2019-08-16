module.exports = (app, final) => {
  app.get('/spotify/auth', final(authRedirect))
}

const authRedirect = async (req, res) => {
  const redirectURI = encodeURIComponent(process.env.REDIRECT_URI)
  const scopes = ['user-top-read', 'user-library-read', 'user-read-email'].join(
    ' '
  )
  const clientID = process.env.SPOTIFY_CLIENT_ID
  const url = `https://accounts.spotify.com/authorize?client_id=${clientID}&response_type=code&redirect_uri=${redirectURI}&scope=${scopes}&show_dialog=true`
  res.redirect(url)
}
