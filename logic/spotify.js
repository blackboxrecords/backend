const axios = require('axios')
const _ = require('lodash')

module.exports = {
  getAccessToken,
  initialAuth,
  loadProfile,
  loadTopArtists,
  loadRelatedArtists,
  autoRetry,
}

const AuthString = Buffer.from(
  `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
).toString('base64')
const URITransform = (data) =>
  Object.entries(data)
    .map((x) => `${encodeURIComponent(x[0])}=${encodeURIComponent(x[1])}`)
    .join('&')

async function rateLimited(fn) {
  try {
    return await fn()
  } catch (err) {
    if (_.get(err, 'response.status') !== 429) throw err
    const retryInterval = _.get(err, 'response.headers.retry-after', 2)
    await new Promise((r) => setTimeout(r, (retryInterval + 5) * 1000))
    return await fn()
  }
}

// For handling 5xx errors
async function autoRetry(fn, retryNum = 0) {
  try {
    return await fn()
  } catch (err) {
    if (retryNum > 3) throw err
    return await autoRetry(fn, ++retryNum)
  }
}

// carmen something

/**
 * @param refreshToken string optional
 * @returns { access_token: string, refresh_token?: string }
 **/
async function getAccessToken(refreshToken) {
  if (refreshToken) {
    // Loads a user auth token
    const { data } = await rateLimited(async () => {
      return await axios.post('https://accounts.spotify.com/api/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }, {
        transformRequest: [URITransform],
        headers: {
          Authorization: `Basic ${AuthString}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      })
    })
    return data
  }
  // Otherwise loads a server to server auth
  const { data } = await rateLimited(async () => {
    return await axios.post('https://accounts.spotify.com/api/token', {
      grant_type: 'client_credentials'
    }, {
      transformRequest: [URITransform],
      headers: {
        Authorization: `Basic ${AuthString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
  })
  return data
}

async function initialAuth(authCode) {
  const { data } = await rateLimited(async () => {
    return await axios.post('https://accounts.spotify.com/api/token', {
      code: authCode,
      grant_type: 'authorization_code',
      redirect_uri: process.env.REDIRECT_URI,
    }, {
      transformRequest: [URITransform],
      headers: {
        Authorization: `Basic ${AuthString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    })
  })
  return data
}

async function loadProfile(accessToken) {
  const { data } = await rateLimited(async () => {
    return await axios.get('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      }
    })
  })
  return data
}

async function loadTopArtists(accessToken, options = {
  limit: 50
}) {
  const { data } = await rateLimited(async () => {
    return await axios.get('https://api.spotify.com/v1/me/top/artists', {
      params: {
        limit: 50,
        ...options,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })
  })
  return data
}

/**
 * Loads related artists for an artist from spotify
 **/
async function loadRelatedArtists(accessToken, artistId) {
  const { data } = await rateLimited(async () => {
    return await axios.get(
      `https://api.spotify.com/v1/artists/${artistId}/related-artists`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        }
      }
    )
  })
  return data
}
