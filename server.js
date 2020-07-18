const app = require('.')
app.listen(4000, (err) => {
  if (err) {
    console.log('Error starting server', err)
    process.exit(1)
  }
  console.log('Listening on port 4000')
})
