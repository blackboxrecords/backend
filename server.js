const axios = require('axios')
const app = require('.')

const server = app.listen(4000, (err) => {
  if (err) {
    console.log('Error starting server', err)
    process.exit(1)
  }
  console.log('Listening on port 4000')
})

server.timeout = 5 * 60 * 1000

const { port } = server.address()

// Auto refresh the exported contents
;(async () => {
  for (;;) {
    try {
      await axios.get(`http://127.0.0.1:${port}/users/artists`, {
        params: {
          refresh: true,
          token: process.env.LOCAL_SECRET,
        }
      })
      console.log('exported artists')
      await axios.get(`http://127.0.0.1:${port}/users/artists/related`, {
        params: {
          refresh: true,
          token: process.env.LOCAL_SECRET,
        }
      })
      console.log('export related artists')
      await axios.get(`http://127.0.0.1:${port}/users/genres`, {
        params: {
          refresh: true,
          token: process.env.LOCAL_SECRET,
        }
      })
      console.log('exported genres')
    } catch (err) {
      console.log(err)
      console.log('Error loading exported data')
    } finally {
      await new Promise(r => setTimeout(r, 1000 * 60 * 60))
    }
  }
})()
